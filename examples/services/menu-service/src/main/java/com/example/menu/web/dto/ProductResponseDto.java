package com.example.menu.web.dto;

import com.example.menu.domain.Product;
import com.example.menu.domain.ProductPrice;
import com.example.menu.domain.ProductStatus;
import java.time.Instant;
import java.util.List;

public record ProductResponseDto(
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
    public static ProductResponseDto from(Product product) {
        return new ProductResponseDto(
                product.getProductId(), product.getExternalId(), product.getSku(), product.getName(),
                product.getPrices(), product.getStatus(), product.getVersion(),
                product.getCreatedAt(), product.getUpdatedAt());
    }
}
