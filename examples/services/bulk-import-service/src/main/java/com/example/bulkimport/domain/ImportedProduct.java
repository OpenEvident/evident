package com.example.bulkimport.domain;

import java.time.Instant;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * Canonical, current state of one imported product — exactly one document
 * per {@code (partnerId, externalId)}. Never carries a resolved
 * {@code productId}; that mapping lives in {@link SyncedProduct} so the
 * import-time hash and the sync-time hash can never influence each other.
 */
@Document("imported_products")
@CompoundIndex(name = "partner_external_unique", def = "{'partnerId': 1, 'externalId': 1}", unique = true)
public class ImportedProduct {

    @Id
    private String id;
    private String partnerId;
    private String externalId;
    private ImportPayload payload;
    private String contentHash;
    private SelectionStatus selectionStatus;
    private ImportOutcome lastImportOutcome;
    private long version;
    private Instant firstImportedAt;
    private Instant lastImportedAt;

    protected ImportedProduct() {
    }

    public ImportedProduct(
            String partnerId,
            String externalId,
            ImportPayload payload,
            String contentHash,
            SelectionStatus selectionStatus,
            ImportOutcome lastImportOutcome,
            long version,
            Instant firstImportedAt,
            Instant lastImportedAt
    ) {
        this.partnerId = partnerId;
        this.externalId = externalId;
        this.payload = payload;
        this.contentHash = contentHash;
        this.selectionStatus = selectionStatus;
        this.lastImportOutcome = lastImportOutcome;
        this.version = version;
        this.firstImportedAt = firstImportedAt;
        this.lastImportedAt = lastImportedAt;
    }

    public String getId() {
        return id;
    }

    public String getPartnerId() {
        return partnerId;
    }

    public String getExternalId() {
        return externalId;
    }

    public ImportPayload getPayload() {
        return payload;
    }

    public String getContentHash() {
        return contentHash;
    }

    public SelectionStatus getSelectionStatus() {
        return selectionStatus;
    }

    public ImportOutcome getLastImportOutcome() {
        return lastImportOutcome;
    }

    public long getVersion() {
        return version;
    }

    public Instant getFirstImportedAt() {
        return firstImportedAt;
    }

    public Instant getLastImportedAt() {
        return lastImportedAt;
    }

    public void markSelected() {
        this.selectionStatus = SelectionStatus.SELECTED;
    }

    /**
     * Applies a re-import: keeps the Mongo {@code _id} and
     * {@code firstImportedAt}, but otherwise reflects the new payload/hash
     * as of this import, bumping {@code version}. Selection status is
     * carried over as-is — a re-import never changes whether an item is
     * selected.
     */
    public ImportedProduct withReImport(ImportPayload newPayload, String newContentHash, ImportOutcome outcome, Instant now) {
        long newVersion = outcome == ImportOutcome.UPDATED ? this.version + 1 : this.version;
        ImportedProduct updated = new ImportedProduct(
                this.partnerId,
                this.externalId,
                newPayload,
                newContentHash,
                this.selectionStatus,
                outcome,
                newVersion,
                this.firstImportedAt,
                now
        );
        updated.id = this.id;
        return updated;
    }
}
