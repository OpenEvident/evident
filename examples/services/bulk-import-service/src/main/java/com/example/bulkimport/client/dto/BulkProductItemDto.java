package com.example.bulkimport.client.dto;

import java.util.List;

public record BulkProductItemDto(
        String externalId,
        String action,
        String sku,
        String name,
        List<ProductPriceDto> prices
) {
}
