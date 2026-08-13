package com.example.bulkimport.domain;

import java.time.Instant;
import java.util.List;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * The dispatch-time record of the last successful sync for one item —
 * kept deliberately separate from {@link ImportedProduct}'s import-time
 * hash so a re-triggered sync for already-current content is a real,
 * observable no-op rather than a wasted duplicate call to menu-service.
 */
@Document("synced_products")
@CompoundIndex(name = "partner_external_unique", def = "{'partnerId': 1, 'externalId': 1}", unique = true)
public class SyncedProduct {

    @Id
    private String id;
    private String partnerId;
    private String externalId;
    private String productId;
    private String resolvedCurrencyId;
    private List<String> resolvedTaxIds;
    private String syncedHash;
    private Instant lastSyncedAt;

    protected SyncedProduct() {
    }

    public SyncedProduct(
            String partnerId,
            String externalId,
            String productId,
            String resolvedCurrencyId,
            List<String> resolvedTaxIds,
            String syncedHash,
            Instant lastSyncedAt
    ) {
        this.partnerId = partnerId;
        this.externalId = externalId;
        this.productId = productId;
        this.resolvedCurrencyId = resolvedCurrencyId;
        this.resolvedTaxIds = resolvedTaxIds;
        this.syncedHash = syncedHash;
        this.lastSyncedAt = lastSyncedAt;
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

    public String getProductId() {
        return productId;
    }

    public String getResolvedCurrencyId() {
        return resolvedCurrencyId;
    }

    public List<String> getResolvedTaxIds() {
        return resolvedTaxIds;
    }

    public String getSyncedHash() {
        return syncedHash;
    }

    public Instant getLastSyncedAt() {
        return lastSyncedAt;
    }

    /** Preserves this document's Mongo {@code _id} while replacing every other field — the upsert path. */
    public SyncedProduct withUpdate(
            String productId,
            String resolvedCurrencyId,
            List<String> resolvedTaxIds,
            String syncedHash,
            Instant lastSyncedAt
    ) {
        SyncedProduct updated = new SyncedProduct(
                this.partnerId, this.externalId, productId, resolvedCurrencyId, resolvedTaxIds, syncedHash, lastSyncedAt);
        updated.id = this.id;
        return updated;
    }
}
