package com.example.menu.client.dto;

import java.util.List;

/**
 * The fully-resolved payload menu-service hands to publishing-service —
 * publishing-service is pure validate + calculate and never looks
 * anything up itself (no reference data, no Mongo lookups beyond its own
 * materialized_views), so every product, category, and tax it might need
 * is expanded inline here.
 */
public record PublishRequestDto(
        String menuId,
        String name,
        String countryId,
        String currencyId,
        int currencyPrecision,
        List<String> menuTaxIds,
        boolean applyMenuLevelTax,
        List<PublishCategoryDto> categories,
        List<PublishTaxDto> taxes
) {
}
