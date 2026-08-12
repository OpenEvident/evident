package com.example.menu.domain;

import java.util.ArrayList;
import java.util.List;

/**
 * Embedded only — the real system persists Category both standalone and
 * embedded in Menu; this design deliberately keeps only the embedded form
 * (see NEXT_SERVICES_DESIGN.md's "what's deliberately left out"). A Menu's
 * {@code categories[]} holds these; each references product IDs it
 * contains, never the other way around.
 */
public class Category {

    private String categoryId;
    private String name;
    private List<String> taxIds;
    private List<String> productIds;

    protected Category() {
    }

    public Category(String categoryId, String name, List<String> taxIds, List<String> productIds) {
        this.categoryId = categoryId;
        this.name = name;
        this.taxIds = taxIds;
        this.productIds = productIds;
    }

    public String getCategoryId() {
        return categoryId;
    }

    public String getName() {
        return name;
    }

    public List<String> getTaxIds() {
        return taxIds;
    }

    public List<String> getProductIds() {
        return productIds;
    }

    public Category withAddedProducts(List<String> productIdsToAdd) {
        List<String> merged = new ArrayList<>(this.productIds);
        for (String productId : productIdsToAdd) {
            if (!merged.contains(productId)) {
                merged.add(productId);
            }
        }
        return new Category(this.categoryId, this.name, this.taxIds, merged);
    }
}
