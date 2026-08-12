package com.example.menu.domain;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * Reference data. {@code precision} is what {@code bulk-import-service}
 * uses to convert a decimal price into integer minor units.
 */
@Document("currencies")
public class Currency {

    @Id
    private String id;
    @Indexed(unique = true)
    private String code;
    private String name;
    private int precision;
    private ReferenceStatus status;

    protected Currency() {
    }

    public Currency(String id, String code, String name, int precision, ReferenceStatus status) {
        this.id = id;
        this.code = code;
        this.name = name;
        this.precision = precision;
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

    public int getPrecision() {
        return precision;
    }

    public ReferenceStatus getStatus() {
        return status;
    }

    public Currency withUpdate(String name, int precision, ReferenceStatus status) {
        return new Currency(this.id, this.code, name, precision, status);
    }

    public Currency withStatus(ReferenceStatus status) {
        return new Currency(this.id, this.code, this.name, this.precision, status);
    }
}
