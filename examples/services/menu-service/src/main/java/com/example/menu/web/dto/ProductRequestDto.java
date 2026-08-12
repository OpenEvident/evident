package com.example.menu.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record ProductRequestDto(
        @NotBlank String sku,
        @NotBlank String name,
        @NotEmpty List<@Valid ProductPriceDto> prices
) {
}
