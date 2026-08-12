package com.example.bulkimport.web.dto;

import jakarta.validation.constraints.NotBlank;

public record SyncResultCallbackDto(
        @NotBlank String syncId,
        @NotBlank String productId,
        @NotBlank String status
) {
}
