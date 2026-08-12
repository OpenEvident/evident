package com.example.menu.client.dto;

import java.util.List;

public record PublishProductDto(String productId, String sku, String name, List<PublishPriceDto> prices) {
}
