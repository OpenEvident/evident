package com.example.menu.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

public record TaxRequestDto(@NotBlank String name, @NotNull BigDecimal percentage, String countryId) {
}
