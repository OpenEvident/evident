package com.example.publishing.web.dto;

import com.example.publishing.domain.AppliedTax;
import com.example.publishing.domain.MaterializedProduct;
import com.example.publishing.domain.TaxSourceLevel;
import java.util.List;

public record MaterializedProductResponseDto(
        String productId,
        String sku,
        String name,
        int unitPrice,
        int taxAmount,
        int priceInclTax,
        List<AppliedTax> appliedTaxes,
        TaxSourceLevel taxSourceLevel
) {
    public static MaterializedProductResponseDto from(MaterializedProduct product) {
        return new MaterializedProductResponseDto(
                product.productId(), product.sku(), product.name(), product.unitPrice(), product.taxAmount(),
                product.priceInclTax(), product.appliedTaxes(), product.taxSourceLevel());
    }
}
