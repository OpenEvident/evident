package com.example.publishing.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record PublishRequestDto(
        @NotBlank String menuId,
        String name,
        String countryId,
        @NotBlank String currencyId,
        int currencyPrecision,
        List<String> menuTaxIds,
        boolean applyMenuLevelTax,
        @NotNull List<PublishCategoryDto> categories,
        @NotNull List<PublishTaxDto> taxes
) {
}
