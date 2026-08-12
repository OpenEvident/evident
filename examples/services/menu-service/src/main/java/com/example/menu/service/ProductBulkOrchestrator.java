package com.example.menu.service;

import com.example.menu.redis.BatchRedisStateStore;
import com.example.menu.redis.BatchStatus;
import com.example.menu.web.dto.BulkProductItemRequestDto;
import com.example.menu.web.dto.BulkProductRequestDto;
import com.example.menu.web.dto.BulkProductResponseDto;
import com.example.menu.web.dto.BulkStatusResponseDto;
import java.util.NoSuchElementException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

/**
 * Entry point for {@code POST /products/bulk} (from the controller) and
 * restart recovery ({@link BatchRecoveryRunner}) — initializes Redis batch
 * state, then delegates the actual per-item work to
 * {@link ProductBulkBatchProcessor}'s {@code @Async} method.
 */
@Service
public class ProductBulkOrchestrator {

    private final BatchRedisStateStore stateStore;
    private final ProductBulkBatchProcessor batchProcessor;
    private final IdGenerator idGenerator;
    private final ObjectMapper objectMapper;
    private final int maxBatchSize;

    public ProductBulkOrchestrator(
            BatchRedisStateStore stateStore,
            ProductBulkBatchProcessor batchProcessor,
            IdGenerator idGenerator,
            ObjectMapper objectMapper,
            @Value("${menu.max-batch-size}") int maxBatchSize
    ) {
        this.stateStore = stateStore;
        this.batchProcessor = batchProcessor;
        this.idGenerator = idGenerator;
        this.objectMapper = objectMapper;
        this.maxBatchSize = maxBatchSize;
    }

    public BulkProductResponseDto startBulk(BulkProductRequestDto request) {
        if (request.items().size() > maxBatchSize) {
            throw new BatchSizeExceededException(request.items().size(), maxBatchSize);
        }

        String batchId = idGenerator.generate("batch");
        stateStore.initBatch(batchId, request.items().size());
        for (BulkProductItemRequestDto item : request.items()) {
            String payloadJson = objectMapper.writeValueAsString(new StoredItem(request.partnerId(), request.syncId(), item));
            stateStore.addPending(batchId, item.externalId(), payloadJson);
        }

        batchProcessor.process(batchId);

        return new BulkProductResponseDto(batchId, request.items().size());
    }

    public BulkStatusResponseDto getStatus(String batchId) {
        BatchStatus status = stateStore.getStatus(batchId)
                .orElseThrow(() -> new NoSuchElementException("no batch with batchId=" + batchId));
        return new BulkStatusResponseDto(batchId, status.total(), status.completed(), status.failed(), status.outcome());
    }

    /** Restart-recovery re-entry — same worker, driven from whatever is still pending in Redis. */
    public void resume(String batchId) {
        batchProcessor.process(batchId);
    }

    /** What actually gets persisted per pending item in Redis, so a restart can reprocess it in full. */
    public record StoredItem(String partnerId, String syncId, BulkProductItemRequestDto item) {
    }
}
