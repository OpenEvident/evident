package com.example.bulkimport.web.dto;

import com.example.bulkimport.domain.ImportItemOutcome;
import com.example.bulkimport.domain.ImportRequest;
import java.time.Instant;
import java.util.List;

public record ImportRequestAuditDto(
        String requestId,
        String partnerId,
        Instant receivedAt,
        List<ImportItemOutcome> items
) {
    public static ImportRequestAuditDto from(ImportRequest request) {
        return new ImportRequestAuditDto(
                request.getRequestId(), request.getPartnerId(), request.getReceivedAt(), request.getItems());
    }
}
