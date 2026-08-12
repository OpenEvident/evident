package com.example.publishing.domain;

import java.util.List;

public record MaterializedProduct(
        String productId,
        String sku,
        String name,
        int unitPrice,
        int taxAmount,
        int priceInclTax,
        List<AppliedTax> appliedTaxes,
        TaxSourceLevel taxSourceLevel
) {
}
