package com.example.menu.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record BulkProductRequestDto(
        @NotBlank String partnerId,
        @NotBlank String syncId,
        @NotEmpty List<@Valid BulkProductItemRequestDto> items
) {
}
