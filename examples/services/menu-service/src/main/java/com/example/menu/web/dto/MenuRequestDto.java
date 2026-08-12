package com.example.menu.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record MenuRequestDto(
        @NotBlank String partnerId,
        @NotBlank String name,
        @NotBlank String countryId,
        @NotBlank String currencyId,
        @NotNull List<String> taxIds,
        boolean applyMenuLevelTax,
        @NotNull List<@Valid CategoryRequestDto> categories
) {
}
