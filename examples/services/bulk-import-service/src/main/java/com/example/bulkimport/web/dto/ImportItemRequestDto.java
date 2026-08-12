package com.example.bulkimport.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

public record ImportItemRequestDto(
        @NotBlank String externalId,
        @NotBlank String sku,
        @NotBlank String name,
        @NotNull BigDecimal price,
        @NotBlank String currencyCode,
        @Valid @NotNull TaxAssignmentDto taxAssignment
) {
}
