package com.example.bulkimport.service;

import com.example.bulkimport.domain.ImportItemOutcome;
import com.example.bulkimport.domain.ImportOutcome;
import com.example.bulkimport.domain.ImportPayload;
import com.example.bulkimport.domain.ImportRequest;
import com.example.bulkimport.domain.ImportedProduct;
import com.example.bulkimport.domain.SelectionStatus;
import com.example.bulkimport.domain.TaxAssignment;
import com.example.bulkimport.logging.StructuredLog;
import com.example.bulkimport.repository.ImportRequestRepository;
import com.example.bulkimport.repository.ImportedProductRepository;
import com.example.bulkimport.web.dto.ImportItemRequestDto;
import com.example.bulkimport.web.dto.ImportRequestDto;
import com.example.bulkimport.web.dto.ImportResponseDto;
import com.example.bulkimport.web.dto.ImportSummaryDto;
import com.example.bulkimport.web.dto.SyncRequestDto;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Workflow 1 — Import. Hash-classifies each item against
 * {@link ImportedProduct}, upserts the canonical record, writes one
 * {@link ImportRequest} audit doc, and — for any item that comes back
 * {@code UPDATED} while already {@code SELECTED} — immediately kicks off
 * Workflow 2 (Sync) for it, with no human re-selection required.
 */
@Service
public class ImportService {

    private static final Logger log = LoggerFactory.getLogger(ImportService.class);

    private final ImportedProductRepository importedProductRepository;
    private final ImportRequestRepository importRequestRepository;
    private final HashService hashService;
    private final IdGenerator idGenerator;
    private final SyncWorkflowService syncWorkflowService;
    private final int maxBatchSize;

    public ImportService(
            ImportedProductRepository importedProductRepository,
            ImportRequestRepository importRequestRepository,
            HashService hashService,
            IdGenerator idGenerator,
            SyncWorkflowService syncWorkflowService,
            @Value("${bulk-import.max-batch-size}") int maxBatchSize
    ) {
        this.importedProductRepository = importedProductRepository;
        this.importRequestRepository = importRequestRepository;
        this.hashService = hashService;
        this.idGenerator = idGenerator;
        this.syncWorkflowService = syncWorkflowService;
        this.maxBatchSize = maxBatchSize;
    }

    public ImportResponseDto processImport(ImportRequestDto request) {
        if (request.items().size() > maxBatchSize) {
            throw new BatchSizeExceededException(request.items().size(), maxBatchSize);
        }

        String requestId = idGenerator.generate("req");
        Instant now = Instant.now();

        int newCount = 0;
        int updatedCount = 0;
        int unchangedCount = 0;
        List<ImportItemOutcome> auditItems = new ArrayList<>();
        List<String> autoSyncExternalIds = new ArrayList<>();

        for (ImportItemRequestDto item : request.items()) {
            ImportPayload payload = toPayload(item);
            String contentHash = hashService.hashPayload(payload);

            Optional<ImportedProduct> existing =
                    importedProductRepository.findByPartnerIdAndExternalId(request.partnerId(), item.externalId());

            ImportOutcome outcome;
            ImportedProduct saved;
            if (existing.isEmpty()) {
                outcome = ImportOutcome.NEW;
                saved = new ImportedProduct(
                        request.partnerId(), item.externalId(), payload, contentHash,
                        SelectionStatus.NOT_SELECTED, ImportOutcome.NEW, 1, now, now);
            } else {
                ImportedProduct current = existing.get();
                outcome = current.getContentHash().equals(contentHash) ? ImportOutcome.UNCHANGED : ImportOutcome.UPDATED;
                saved = current.withReImport(payload, contentHash, outcome, now);
            }
            saved = importedProductRepository.save(saved);

            switch (outcome) {
                case NEW -> newCount++;
                case UPDATED -> updatedCount++;
                case UNCHANGED -> unchangedCount++;
            }
            auditItems.add(new ImportItemOutcome(item.externalId(), outcome, contentHash));

            StructuredLog.fields()
                    .with("requestId", requestId)
                    .with("externalId", item.externalId())
                    .with("outcome", outcome.name())
                    .with("event", "item.imported")
                    .info(log, "imported " + item.externalId() + " — " + outcome);

            if (outcome == ImportOutcome.UPDATED && saved.getSelectionStatus() == SelectionStatus.SELECTED) {
                autoSyncExternalIds.add(item.externalId());
            }
        }

        importRequestRepository.save(new ImportRequest(requestId, request.partnerId(), now, auditItems));

        if (!autoSyncExternalIds.isEmpty()) {
            syncWorkflowService.startSync(new SyncRequestDto(request.partnerId(), autoSyncExternalIds));
        }

        return new ImportResponseDto(
                requestId,
                request.items().size(),
                new ImportSummaryDto(newCount, updatedCount, unchangedCount),
                autoSyncExternalIds
        );
    }

    private ImportPayload toPayload(ImportItemRequestDto item) {
        return new ImportPayload(
                item.sku(),
                item.name(),
                item.price(),
                item.currencyCode(),
                new TaxAssignment(item.taxAssignment().name(), item.taxAssignment().percentage())
        );
    }
}
