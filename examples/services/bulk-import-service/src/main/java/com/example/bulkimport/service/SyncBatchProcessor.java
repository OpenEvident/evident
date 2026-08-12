package com.example.bulkimport.service;

import com.example.bulkimport.client.MenuServiceClient;
import com.example.bulkimport.client.MenuServiceClientException;
import com.example.bulkimport.client.dto.BulkProductItemDto;
import com.example.bulkimport.client.dto.BulkProductRequestDto;
import com.example.bulkimport.client.dto.BulkProductResponseDto;
import com.example.bulkimport.client.dto.ProductPriceDto;
import com.example.bulkimport.domain.ImportedProduct;
import com.example.bulkimport.domain.SyncItemAction;
import com.example.bulkimport.domain.SyncStep;
import com.example.bulkimport.domain.SyncedProduct;
import com.example.bulkimport.logging.StructuredLog;
import com.example.bulkimport.redis.SyncItemState;
import com.example.bulkimport.redis.SyncRedisStateStore;
import com.example.bulkimport.repository.ImportedProductRepository;
import com.example.bulkimport.repository.SyncedProductRepository;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

/**
 * The Sync workflow's worker — drives every pending item of a syncId
 * through {@code RESOLVING_REFS} → {@code CHECKING_SYNC_HASH} →
 * {@code DISPATCHING}, then dispatches every item that needs one real
 * batched call to menu-service. Reads its work list from Redis rather than
 * an in-memory argument, so the exact same method also serves as the
 * restart-recovery entry point (see {@code SyncRecoveryRunner}) — whatever
 * is still sitting in {@code sync:{syncId}:pending} gets re-driven from
 * wherever its own per-item state left off.
 */
@Component
public class SyncBatchProcessor {

    private static final Logger log = LoggerFactory.getLogger(SyncBatchProcessor.class);

    private final SyncRedisStateStore stateStore;
    private final ImportedProductRepository importedProductRepository;
    private final SyncedProductRepository syncedProductRepository;
    private final ReferenceResolutionService referenceResolutionService;
    private final MenuServiceClient menuServiceClient;

    public SyncBatchProcessor(
            SyncRedisStateStore stateStore,
            ImportedProductRepository importedProductRepository,
            SyncedProductRepository syncedProductRepository,
            ReferenceResolutionService referenceResolutionService,
            MenuServiceClient menuServiceClient
    ) {
        this.stateStore = stateStore;
        this.importedProductRepository = importedProductRepository;
        this.syncedProductRepository = syncedProductRepository;
        this.referenceResolutionService = referenceResolutionService;
        this.menuServiceClient = menuServiceClient;
    }

    @Async
    public void process(String syncId) {
        Set<String> pending = stateStore.getPending(syncId);
        List<PreparedItem> toDispatch = new ArrayList<>();

        for (String externalId : pending) {
            try {
                prepareItem(syncId, externalId).ifPresent(toDispatch::add);
            } catch (Exception e) {
                failItem(syncId, externalId, e.getMessage());
            }
        }

        if (!toDispatch.isEmpty()) {
            dispatch(syncId, toDispatch);
        }
    }

    private Optional<PreparedItem> prepareItem(String syncId, String externalId) {
        SyncItemState state = stateStore.getItemState(syncId, externalId)
                .orElseThrow(() -> new IllegalStateException("no Redis state for item " + externalId));
        String partnerId = state.partnerId();

        ImportedProduct imported = importedProductRepository.findByPartnerIdAndExternalId(partnerId, externalId)
                .orElseThrow(() -> new IllegalStateException("no imported product for externalId=" + externalId));

        ResolvedRefs refs = referenceResolutionService.resolve(imported.getPayload());
        stateStore.setResolvedRefs(syncId, externalId, refs.currencyId(), refs.taxIds());
        stateStore.setStep(syncId, externalId, SyncStep.CHECKING_SYNC_HASH);

        Optional<SyncedProduct> existingSync = syncedProductRepository.findByPartnerIdAndExternalId(partnerId, externalId);
        boolean unchanged = existingSync.isPresent() && existingSync.get().getSyncedHash().equals(imported.getContentHash());
        if (unchanged) {
            stateStore.setStep(syncId, externalId, SyncStep.SKIPPED);
            stateStore.removePending(syncId, externalId);
            StructuredLog.fields()
                    .with("syncId", syncId)
                    .with("externalId", externalId)
                    .with("event", "item.sync.skipped")
                    .with("reason", "unchanged-since-last-sync")
                    .info(log, "sync skipped for " + externalId + " — unchanged since last sync");
            return Optional.empty();
        }

        stateStore.setStep(syncId, externalId, SyncStep.DISPATCHING);
        SyncItemAction action = existingSync.map(SyncedProduct::getProductId).isPresent()
                ? SyncItemAction.UPDATE
                : SyncItemAction.CREATE;
        stateStore.setAction(syncId, externalId, action);
        stateStore.setDispatchedHash(syncId, externalId, imported.getContentHash());

        return Optional.of(new PreparedItem(partnerId, externalId, imported, refs, action));
    }

    private void dispatch(String syncId, List<PreparedItem> items) {
        Map<String, List<PreparedItem>> byPartner = new LinkedHashMap<>();
        for (PreparedItem item : items) {
            byPartner.computeIfAbsent(item.partnerId(), k -> new ArrayList<>()).add(item);
        }

        for (Map.Entry<String, List<PreparedItem>> entry : byPartner.entrySet()) {
            dispatchForPartner(syncId, entry.getKey(), entry.getValue());
        }
    }

    private void dispatchForPartner(String syncId, String partnerId, List<PreparedItem> items) {
        List<BulkProductItemDto> dtos = items.stream().map(this::toDto).toList();

        try {
            BulkProductResponseDto response = menuServiceClient.dispatchProductsBulk(
                    new BulkProductRequestDto(partnerId, syncId, dtos));
            for (PreparedItem item : items) {
                StructuredLog.fields()
                        .with("syncId", syncId)
                        .with("externalId", item.externalId())
                        .with("resolvedCurrencyId", item.refs().currencyId())
                        .with("resolvedTaxIds", String.join(",", item.refs().taxIds()))
                        .with("action", item.action().name())
                        .with("batchId", response.batchId())
                        .with("event", "item.sync.dispatched")
                        .info(log, "dispatched " + item.externalId() + " to menu-service as " + item.action());
                stateStore.setStep(syncId, item.externalId(), SyncStep.AWAITING_RESULT);
            }
        } catch (MenuServiceClientException e) {
            for (PreparedItem item : items) {
                failItem(syncId, item.externalId(), e.getMessage());
            }
        }
    }

    private BulkProductItemDto toDto(PreparedItem item) {
        int amount = item.imported().getPayload().price()
                .movePointRight(item.refs().currencyPrecision())
                .setScale(0, RoundingMode.HALF_UP)
                .intValueExact();
        ProductPriceDto price = new ProductPriceDto(
                item.refs().currencyId(),
                amount,
                false,
                item.refs().taxIds()
        );
        return new BulkProductItemDto(
                item.externalId(),
                item.action().name(),
                item.imported().getPayload().sku(),
                item.imported().getPayload().name(),
                List.of(price)
        );
    }

    private void failItem(String syncId, String externalId, String error) {
        stateStore.setStep(syncId, externalId, SyncStep.FAILED);
        stateStore.setError(syncId, externalId, error == null ? "unknown error" : error);
        stateStore.removePending(syncId, externalId);
        StructuredLog.fields()
                .with("syncId", syncId)
                .with("externalId", externalId)
                .with("error", error == null ? "unknown error" : error)
                .with("event", "item.sync.failed")
                .warn(log, "sync failed for " + externalId);
    }

    private record PreparedItem(
            String partnerId,
            String externalId,
            ImportedProduct imported,
            ResolvedRefs refs,
            SyncItemAction action
    ) {
    }
}
