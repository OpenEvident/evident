package com.example.publishing.web.dto;

import java.util.List;

/**
 * {@code sku}/{@code name} are deliberately not bean-validated here —
 * "non-empty" is one of Phase 1's own business validation rules (collected
 * into the structured {@code errors} list, not a raw 400), not a request-
 * shape constraint.
 */
public record PublishProductDto(String productId, String sku, String name, List<PublishPriceDto> prices) {
}
