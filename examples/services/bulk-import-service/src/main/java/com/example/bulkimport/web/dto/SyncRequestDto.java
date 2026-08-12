package com.example.bulkimport.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record SyncRequestDto(
        @NotBlank String partnerId,
        @NotEmpty List<@NotBlank String> externalIds
) {
}
