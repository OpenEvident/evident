package com.example.menu.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record ProductPriceDto(
        @NotBlank String currencyId,
        int amount,
        boolean taxInclusive,
        @NotNull List<String> taxIds
) {
}
