package com.example.bulkimport.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

public record TaxAssignmentDto(
        @NotBlank String name,
        @NotNull BigDecimal percentage
) {
}
