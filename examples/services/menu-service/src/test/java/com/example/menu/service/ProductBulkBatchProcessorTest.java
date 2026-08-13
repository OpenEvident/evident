package com.example.menu.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.menu.client.BulkImportCallbackClient;
import com.example.menu.client.BulkImportCallbackException;
import com.example.menu.domain.Product;
import com.example.menu.domain.ProductStatus;
import com.example.menu.redis.BatchRedisStateStore;
import com.example.menu.service.ProductBulkOrchestrator.StoredItem;
import com.example.menu.web.dto.BulkProductItemRequestDto;
import com.example.menu.web.dto.ProductPriceDto;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import tools.jackson.databind.ObjectMapper;

/**
 * Regression coverage for a real double-count bug found by actually
 * running a flow live against this service: a failed callback delivery
 * was counting the same item as "completed" twice (once in the try
 * block's happy path, once again in the catch handler), which could push
 * a batch's {@code completed} count past its {@code total} and corrupt
 * the COMPLETED/PARTIALLY_COMPLETED outcome.
 */
@ExtendWith(MockitoExtension.class)
class ProductBulkBatchProcessorTest {

    @Mock
    private BatchRedisStateStore stateStore;
    @Mock
    private ProductService productService;
    @Mock
    private BulkImportCallbackClient callbackClient;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void aFailedCallbackStillCountsTheItemAsCompletedExactlyOnce() throws Exception {
        String batchId = "batch_1";
        String externalId = "ext_1";
        BulkProductItemRequestDto item = new BulkProductItemRequestDto(
                externalId, "CREATE", "SKU-1", "Item", List.of(new ProductPriceDto("cur_1", 1000, false, List.of())));
        String payloadJson = objectMapper.writeValueAsString(new StoredItem("partner-1", "sync_1", item, null));

        when(stateStore.getPending(batchId)).thenReturn(Set.of(externalId));
        when(stateStore.tryLock(eq(batchId), eq(externalId), any())).thenReturn(true);
        when(stateStore.getItemPayload(batchId, externalId)).thenReturn(Optional.of(payloadJson));

        Product saved = new Product(
                "prod_1", externalId, "SKU-1", "Item", List.of(), ProductStatus.ACTIVE, 1, Instant.now(), Instant.now());
        when(productService.createFromBulk(eq(externalId), eq("SKU-1"), eq("Item"), any())).thenReturn(saved);
        doThrow(new BulkImportCallbackException("boom", new RuntimeException("connection refused")))
                .when(callbackClient).sendSyncResult(eq(externalId), eq("sync_1"), eq("prod_1"), eq("SYNCED"));

        ProductBulkBatchProcessor processor = new ProductBulkBatchProcessor(stateStore, productService, callbackClient, objectMapper);
        processor.process(batchId);

        verify(stateStore, times(1)).incrementCompleted(batchId);
        verify(stateStore, never()).incrementFailed(any());
    }

    @Test
    void aSuccessfulItemCountsAsCompletedExactlyOnce() throws Exception {
        String batchId = "batch_2";
        String externalId = "ext_2";
        BulkProductItemRequestDto item = new BulkProductItemRequestDto(
                externalId, "CREATE", "SKU-2", "Item 2", List.of(new ProductPriceDto("cur_1", 2000, false, List.of())));
        String payloadJson = objectMapper.writeValueAsString(new StoredItem("partner-1", "sync_2", item, null));

        when(stateStore.getPending(batchId)).thenReturn(Set.of(externalId));
        when(stateStore.tryLock(eq(batchId), eq(externalId), any())).thenReturn(true);
        when(stateStore.getItemPayload(batchId, externalId)).thenReturn(Optional.of(payloadJson));

        Product saved = new Product(
                "prod_2", externalId, "SKU-2", "Item 2", List.of(), ProductStatus.ACTIVE, 1, Instant.now(), Instant.now());
        when(productService.createFromBulk(eq(externalId), eq("SKU-2"), eq("Item 2"), any())).thenReturn(saved);

        ProductBulkBatchProcessor processor = new ProductBulkBatchProcessor(stateStore, productService, callbackClient, objectMapper);
        processor.process(batchId);

        verify(stateStore, times(1)).incrementCompleted(batchId);
    }

    @Test
    void simulateItemDelayMsActuallyDelaysProcessing() throws Exception {
        String batchId = "batch_3";
        String externalId = "ext_3";
        BulkProductItemRequestDto item = new BulkProductItemRequestDto(
                externalId, "CREATE", "SKU-3", "Item 3", List.of(new ProductPriceDto("cur_1", 3000, false, List.of())));
        String payloadJson = objectMapper.writeValueAsString(new StoredItem("partner-1", "sync_3", item, 150));

        when(stateStore.getPending(batchId)).thenReturn(Set.of(externalId));
        when(stateStore.tryLock(eq(batchId), eq(externalId), any())).thenReturn(true);
        when(stateStore.getItemPayload(batchId, externalId)).thenReturn(Optional.of(payloadJson));

        Product saved = new Product(
                "prod_3", externalId, "SKU-3", "Item 3", List.of(), ProductStatus.ACTIVE, 1, Instant.now(), Instant.now());
        when(productService.createFromBulk(eq(externalId), eq("SKU-3"), eq("Item 3"), any())).thenReturn(saved);

        ProductBulkBatchProcessor processor = new ProductBulkBatchProcessor(stateStore, productService, callbackClient, objectMapper);
        long start = System.nanoTime();
        processor.process(batchId);
        long elapsedMs = (System.nanoTime() - start) / 1_000_000;

        org.assertj.core.api.Assertions.assertThat(elapsedMs).isGreaterThanOrEqualTo(150);
        verify(stateStore, times(1)).incrementCompleted(batchId);
    }
}
