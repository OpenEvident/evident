package com.example.menu.service;

import com.example.menu.client.BulkImportCallbackClient;
import com.example.menu.client.BulkImportCallbackException;
import com.example.menu.domain.Product;
import com.example.menu.domain.ProductPrice;
import com.example.menu.logging.StructuredLog;
import com.example.menu.redis.BatchRedisStateStore;
import com.example.menu.service.ProductBulkOrchestrator.StoredItem;
import com.example.menu.web.dto.BulkProductItemRequestDto;
import com.example.menu.web.dto.ProductPriceDto;
import java.time.Duration;
import java.util.List;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/**
 * The bulk-dispatch worker — pulls whatever's still pending for a batchId
 * out of Redis (fresh dispatch or restart recovery, same entry point),
 * CREATE/UPDATEs the standalone product, cascades the reverse-lookup
 * stale-flag, and calls back bulk-import-service per item.
 */
@Component
public class ProductBulkBatchProcessor {

    private static final Logger log = LoggerFactory.getLogger(ProductBulkBatchProcessor.class);
    private static final Duration LOCK_TTL = Duration.ofMinutes(2);

    private final BatchRedisStateStore stateStore;
    private final ProductService productService;
    private final BulkImportCallbackClient callbackClient;
    private final ObjectMapper objectMapper;

    public ProductBulkBatchProcessor(
            BatchRedisStateStore stateStore,
            ProductService productService,
            BulkImportCallbackClient callbackClient,
            ObjectMapper objectMapper
    ) {
        this.stateStore = stateStore;
        this.productService = productService;
        this.callbackClient = callbackClient;
        this.objectMapper = objectMapper;
    }

    @Async
    public void process(String batchId) {
        Set<String> pending = stateStore.getPending(batchId);
        for (String externalId : pending) {
            if (!stateStore.tryLock(batchId, externalId, LOCK_TTL)) {
                continue; // another in-flight attempt (e.g. concurrent recovery pass) already owns this item
            }
            processItem(batchId, externalId);
        }
    }

    private void processItem(String batchId, String externalId) {
        String syncId = null;
        try {
            String payloadJson = stateStore.getItemPayload(batchId, externalId)
                    .orElseThrow(() -> new IllegalStateException("no stored payload for item " + externalId));
            StoredItem stored = objectMapper.readValue(payloadJson, StoredItem.class);
            syncId = stored.syncId();
            BulkProductItemRequestDto item = stored.item();
            List<ProductPrice> prices = toDomainPrices(item.prices());

            Product saved = "CREATE".equals(item.action())
                    ? productService.createFromBulk(externalId, item.sku(), item.name(), prices)
                    : productService.updateFromBulk(externalId, item.sku(), item.name(), prices);

            stateStore.incrementCompleted(batchId);
            stateStore.removePending(batchId, externalId);
            callbackClient.sendSyncResult(externalId, syncId, saved.getProductId(), "SYNCED");
        } catch (BulkImportCallbackException e) {
            // The product was saved; only the callback failed. Still counts as completed —
            // bulk-import-service's own item stays AWAITING_RESULT until it gets a signal,
            // which is a known, accepted gap in this example's at-least-once delivery story.
            stateStore.incrementCompleted(batchId);
            stateStore.removePending(batchId, externalId);
            StructuredLog.fields()
                    .with("batchId", batchId)
                    .with("externalId", externalId)
                    .with("error", String.valueOf(e.getMessage()))
                    .with("event", "item.callback.failed")
                    .warn(log, "callback delivery failed for " + externalId);
        } catch (Exception e) {
            stateStore.incrementFailed(batchId);
            stateStore.removePending(batchId, externalId);
            StructuredLog.fields()
                    .with("batchId", batchId)
                    .with("externalId", externalId)
                    .with("error", String.valueOf(e.getMessage()))
                    .with("event", "item.bulk.failed")
                    .warn(log, "bulk item processing failed for " + externalId);
            if (syncId != null) {
                callbackClient.sendSyncResult(externalId, syncId, "", "FAILED");
            }
        }
    }

    private List<ProductPrice> toDomainPrices(List<ProductPriceDto> dtos) {
        return dtos.stream()
                .map(dto -> new ProductPrice(dto.currencyId(), dto.amount(), dto.taxInclusive(), dto.taxIds()))
                .toList();
    }
}
