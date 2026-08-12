package com.example.menu.domain;

import java.math.BigDecimal;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * Reference data — percentage, optional country scope, soft delete.
 * {@code countryId} is {@code null} for a globally-scoped tax (e.g. the
 * seeded "Service Tax") or for any tax find-or-created by
 * bulk-import-service's Sync workflow, which never carries country
 * information in the raw feed.
 */
@Document("taxes")
public class Tax {

    @Id
    private String id;
    private String name;
    private BigDecimal percentage;
    private String countryId;
    private ReferenceStatus status;
    private long version;

    protected Tax() {
    }

    public Tax(String id, String name, BigDecimal percentage, String countryId, ReferenceStatus status, long version) {
        this.id = id;
        this.name = name;
        this.percentage = percentage;
        this.countryId = countryId;
        this.status = status;
        this.version = version;
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public BigDecimal getPercentage() {
        return percentage;
    }

    public String getCountryId() {
        return countryId;
    }

    public ReferenceStatus getStatus() {
        return status;
    }

    public long getVersion() {
        return version;
    }

    public Tax withUpdate(String name, BigDecimal percentage, String countryId, ReferenceStatus status) {
        return new Tax(this.id, name, percentage, countryId, status, this.version + 1);
    }

    public Tax withStatus(ReferenceStatus status) {
        return new Tax(this.id, this.name, this.percentage, this.countryId, status, this.version + 1);
    }
}
