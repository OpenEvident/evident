package com.example.menu.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record MenuUpdateRequestDto(
        @NotBlank String name,
        @NotBlank String countryId,
        @NotBlank String currencyId,
        @NotNull List<String> taxIds,
        boolean applyMenuLevelTax
) {
}
