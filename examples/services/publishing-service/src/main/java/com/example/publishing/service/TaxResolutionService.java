package com.example.publishing.service;

import com.example.publishing.domain.TaxSourceLevel;
import com.example.publishing.web.dto.PublishCategoryDto;
import com.example.publishing.web.dto.PublishPriceDto;
import com.example.publishing.web.dto.PublishRequestDto;
import com.example.publishing.web.dto.PublishTaxDto;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.stereotype.Component;

/**
 * The priority-never-merge tax resolution ladder — product-level tax
 * wins outright over category-level, which wins outright over menu-level;
 * levels are never combined. Shared by both {@link ValidationService}
 * (checks every resolved tax is ACTIVE) and {@link MaterializeService}
 * (does the actual math) so the two phases can never disagree about which
 * level won.
 */
@Component
public class TaxResolutionService {

    /** The raw winning level's taxIds — first non-empty level wins outright, never merged with another. */
    public TaxSourceLevel resolveWinningLevel(PublishPriceDto priceLeg, PublishCategoryDto category, PublishRequestDto menu) {
        if (!priceLeg.taxIds().isEmpty()) {
            return TaxSourceLevel.PRODUCT;
        }
        if (!category.taxIds().isEmpty()) {
            return TaxSourceLevel.CATEGORY;
        }
        if (menu.applyMenuLevelTax()) {
            return TaxSourceLevel.MENU;
        }
        return TaxSourceLevel.NONE;
    }

    public List<String> winningTaxIds(PublishPriceDto priceLeg, PublishCategoryDto category, PublishRequestDto menu) {
        return switch (resolveWinningLevel(priceLeg, category, menu)) {
            case PRODUCT -> priceLeg.taxIds();
            case CATEGORY -> category.taxIds();
            case MENU -> menu.menuTaxIds();
            case NONE -> List.of();
        };
    }

    /** Which level's taxIds apply to this product, with each ID already resolved to its full {@link PublishTaxDto}. */
    public TaxResolution resolveApplicableTaxes(
            PublishPriceDto priceLeg, PublishCategoryDto category, PublishRequestDto menu, Map<String, PublishTaxDto> taxesById
    ) {
        TaxSourceLevel level = resolveWinningLevel(priceLeg, category, menu);
        List<PublishTaxDto> resolved = winningTaxIds(priceLeg, category, menu).stream()
                .map(taxesById::get)
                .filter(Objects::nonNull)
                .toList();
        return new TaxResolution(resolved, level);
    }

    /** Drops any resolved tax whose countryId is set and doesn't match the menu's — silently, per design decision. */
    public List<PublishTaxDto> filterByCountry(List<PublishTaxDto> taxes, String menuCountryId) {
        return taxes.stream()
                .filter(t -> t.countryId() == null || t.countryId().equals(menuCountryId))
                .toList();
    }
}
