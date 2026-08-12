package com.example.menu.domain;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * Reference data — {@code _id} is the business-visible ID itself (e.g.
 * {@code cty_ae_001}), unlike {@link Product}/{@link Menu} which keep a
 * separate Mongo-generated {@code _id} alongside their own business ID.
 * Kept intentionally minimal — just {@code code}/{@code defaultCurrencyId}.
 */
@Document("countries")
public class Country {

    @Id
    private String id;
    @Indexed(unique = true)
    private String code;
    private String name;
    private String defaultCurrencyId;
    private ReferenceStatus status;

    protected Country() {
    }

    public Country(String id, String code, String name, String defaultCurrencyId, ReferenceStatus status) {
        this.id = id;
        this.code = code;
        this.name = name;
        this.defaultCurrencyId = defaultCurrencyId;
        this.status = status;
    }

    public String getId() {
        return id;
    }

    public String getCode() {
        return code;
    }

    public String getName() {
        return name;
    }

    public String getDefaultCurrencyId() {
        return defaultCurrencyId;
    }

    public ReferenceStatus getStatus() {
        return status;
    }

    public Country withUpdate(String name, String defaultCurrencyId, ReferenceStatus status) {
        return new Country(this.id, this.code, name, defaultCurrencyId, status);
    }

    public Country withStatus(ReferenceStatus status) {
        return new Country(this.id, this.code, this.name, this.defaultCurrencyId, status);
    }
}
