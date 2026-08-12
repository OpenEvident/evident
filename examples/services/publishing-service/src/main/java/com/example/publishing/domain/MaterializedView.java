package com.example.publishing.domain;

import java.time.Instant;
import java.util.List;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

@Document("materialized_views")
public class MaterializedView {

    @Id
    private String id;
    @Indexed(unique = true)
    private String menuId;
    private String name;
    private List<MaterializedProduct> products;
    private Instant publishedAt;

    protected MaterializedView() {
    }

    public MaterializedView(String menuId, String name, List<MaterializedProduct> products, Instant publishedAt) {
        this.menuId = menuId;
        this.name = name;
        this.products = products;
        this.publishedAt = publishedAt;
    }

    public String getId() {
        return id;
    }

    public String getMenuId() {
        return menuId;
    }

    public String getName() {
        return name;
    }

    public List<MaterializedProduct> getProducts() {
        return products;
    }

    public Instant getPublishedAt() {
        return publishedAt;
    }
}
