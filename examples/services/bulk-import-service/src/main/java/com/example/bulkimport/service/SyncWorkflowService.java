package com.example.bulkimport.service;

import com.example.bulkimport.domain.ImportedProduct;
import com.example.bulkimport.domain.SyncStep;
import com.example.bulkimport.domain.SyncedProduct;
import com.example.bulkimport.logging.StructuredLog;
import com.example.bulkimport.redis.SyncItemState;
import com.example.bulkimport.redis.SyncRedisStateStore;
import com.example.bulkimport.repository.ImportedProductRepository;
import com.example.bulkimport.repository.SyncedProductRepository;
import com.example.bulkimport.web.dto.SyncRequestDto;
import com.example.bulkimport.web.dto.SyncResponseDto;
import com.example.bulkimport.web.dto.SyncResultCallbackDto;
import java.time.Instant;
import java.util.NoSuchElementException;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Entry points into the Sync workflow — starting a new sync (from
 * {@code POST /sync}) and completing one item via menu-service's callback
 * ({@code POST /imports/products/{externalId}/sync-result}).
 */
@Service
public class SyncWorkflowService {

    private static final Logger log = LoggerFactory.getLogger(SyncWorkflowService.class);
    private static final String SYNCED = "SYNCED";

    private final SyncRedisStateStore stateStore;
    private final ImportedProductRepository importedProductRepository;
    private final SyncedProductRepository syncedProductRepository;
    private final SyncBatchProcessor batchProcessor;
    private final IdGenerator idGenerator;

    public SyncWorkflowService(
            SyncRedisStateStore stateStore,
            ImportedProductRepository importedProductRepository,
            SyncedProductRepository syncedProductRepository,
            SyncBatchProcessor batchProcessor,
            IdGenerator idGenerator
    ) {
        this.stateStore = stateStore;
        this.importedProductRepository = importedProductRepository;
        this.syncedProductRepository = syncedProductRepository;
        this.batchProcessor = batchProcessor;
        this.idGenerator = idGenerator;
    }

    public SyncResponseDto startSync(SyncRequestDto request) {
        String syncId = idGenerator.generate("sync");
        for (String externalId : request.externalIds()) {
            importedProductRepository.findByPartnerIdAndExternalId(request.partnerId(), externalId)
                    .orElseThrow(() -> new NoSuchElementException(
                            "no imported product for partnerId=" + request.partnerId() + " externalId=" + externalId));
            stateStore.addPending(syncId, externalId);
            stateStore.initItem(syncId, externalId, request.partnerId());
        }

        batchProcessor.process(syncId);

        return new SyncResponseDto(syncId, request.externalIds().size());
    }

    public void handleSyncResult(String externalId, SyncResultCallbackDto callback) {
        String syncId = callback.syncId();
        SyncItemState state = stateStore.getItemState(syncId, externalId)
                .orElseThrow(() -> new NoSuchElementException(
                        "no sync state for syncId=" + syncId + " externalId=" + externalId));

        if (!SYNCED.equals(callback.status())) {
            stateStore.setStep(syncId, externalId, SyncStep.FAILED);
            stateStore.setError(syncId, externalId, "menu-service reported status=" + callback.status());
            stateStore.removePending(syncId, externalId);
            StructuredLog.fields()
                    .with("syncId", syncId)
                    .with("externalId", externalId)
                    .with("status", callback.status())
                    .with("event", "item.sync.failed")
                    .warn(log, "menu-service reported a non-success sync status for " + externalId);
            return;
        }

        String dispatchedHash = stateStore.getDispatchedHash(syncId, externalId)
                .orElseThrow(() -> new IllegalStateException("no dispatchedHash recorded for " + externalId));

        Optional<SyncedProduct> existing = syncedProductRepository.findByPartnerIdAndExternalId(state.partnerId(), externalId);
        SyncedProduct syncedProduct = existing
                .map(previous -> previous.withUpdate(
                        callback.productId(), state.resolvedCurrencyId(), state.resolvedTaxIds(), dispatchedHash, Instant.now()))
                .orElseGet(() -> new SyncedProduct(
                        state.partnerId(),
                        externalId,
                        callback.productId(),
                        state.resolvedCurrencyId(),
                        state.resolvedTaxIds(),
                        dispatchedHash,
                        Instant.now()
                ));
        syncedProductRepository.save(syncedProduct);

        importedProductRepository.findByPartnerIdAndExternalId(state.partnerId(), externalId).ifPresent(imported -> {
            imported.markSelected();
            importedProductRepository.save(imported);
        });

        stateStore.setStep(syncId, externalId, SyncStep.DONE);
        stateStore.removePending(syncId, externalId);

        StructuredLog.fields()
                .with("syncId", syncId)
                .with("externalId", externalId)
                .with("productId", callback.productId())
                .with("status", callback.status())
                .with("event", "item.sync.completed")
                .info(log, "sync completed for " + externalId);
    }

    /** Restart-recovery re-entry — same worker, driven from whatever is still pending in Redis. */
    public void resume(String syncId) {
        batchProcessor.process(syncId);
    }
}
