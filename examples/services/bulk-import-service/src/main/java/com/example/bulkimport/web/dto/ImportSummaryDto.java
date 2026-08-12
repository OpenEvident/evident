package com.example.bulkimport.web.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record ImportSummaryDto(
        @JsonProperty("new") int newCount,
        @JsonProperty("updated") int updatedCount,
        @JsonProperty("unchanged") int unchangedCount
) {
}
