package com.example.bulkimport.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record ImportRequestDto(
        @NotBlank String partnerId,
        @NotEmpty List<@Valid ImportItemRequestDto> items
) {
}
