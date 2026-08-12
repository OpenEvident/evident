package com.example.bulkimport.web.dto;

import java.util.List;

public record ImportResponseDto(
        String requestId,
        int itemCount,
        ImportSummaryDto summary,
        List<String> autoSyncTriggered
) {
}
