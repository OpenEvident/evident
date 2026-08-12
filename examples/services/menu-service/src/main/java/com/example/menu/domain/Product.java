package com.example.menu.domain;

import java.time.Instant;
import java.util.List;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * Standalone — no menu/category reference, confirmed against real
 * {@code Product.java} directly. {@code productId} is the business-visible
 * ID (separate from the Mongo-generated {@code _id}), matching the real
 * system's shape. {@code externalId} is only present for products sourced
 * from bulk-import-service; {@code null} for products created directly via
 * this service's own CRUD.
 */
@Document("products")
public class Product {

    @Id
    private String id;
    @Indexed(unique = true)
    private String productId;
    @Indexed(unique = true, sparse = true)
    private String externalId;
    private String sku;
    private String name;
    private List<ProductPrice> prices;
    private ProductStatus status;
    private long version;
    private Instant createdAt;
    private Instant updatedAt;

    protected Product() {
    }

    public Product(
            String productId,
            String externalId,
            String sku,
            String name,
            List<ProductPrice> prices,
            ProductStatus status,
            long version,
            Instant createdAt,
            Instant updatedAt
    ) {
        this.productId = productId;
        this.externalId = externalId;
        this.sku = sku;
        this.name = name;
        this.prices = prices;
        this.status = status;
        this.version = version;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public String getId() {
        return id;
    }

    public String getProductId() {
        return productId;
    }

    public String getExternalId() {
        return externalId;
    }

    public String getSku() {
        return sku;
    }

    public String getName() {
        return name;
    }

    public List<ProductPrice> getPrices() {
        return prices;
    }

    public ProductStatus getStatus() {
        return status;
    }

    public long getVersion() {
        return version;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    /** Preserves Mongo {@code _id}, {@code productId}, {@code externalId} and {@code createdAt}; replaces the rest. */
    public Product withUpdate(String sku, String name, List<ProductPrice> prices, Instant now) {
        Product updated = new Product(
                this.productId, this.externalId, sku, name, prices, this.status, this.version + 1, this.createdAt, now);
        updated.id = this.id;
        return updated;
    }

    public Product withStatus(ProductStatus status, Instant now) {
        Product updated = new Product(
                this.productId, this.externalId, this.sku, this.name, this.prices, status, this.version + 1,
                this.createdAt, now);
        updated.id = this.id;
        return updated;
    }
}
