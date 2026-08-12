package com.example.bulkimport.web.dto;

import com.example.bulkimport.domain.ImportOutcome;
import com.example.bulkimport.domain.ImportPayload;
import com.example.bulkimport.domain.ImportedProduct;
import com.example.bulkimport.domain.SelectionStatus;
import java.time.Instant;

public record ImportedProductDto(
        String partnerId,
        String externalId,
        ImportPayload payload,
        String contentHash,
        SelectionStatus selectionStatus,
        ImportOutcome lastImportOutcome,
        long version,
        Instant firstImportedAt,
        Instant lastImportedAt
) {
    public static ImportedProductDto from(ImportedProduct product) {
        return new ImportedProductDto(
                product.getPartnerId(),
                product.getExternalId(),
                product.getPayload(),
                product.getContentHash(),
                product.getSelectionStatus(),
                product.getLastImportOutcome(),
                product.getVersion(),
                product.getFirstImportedAt(),
                product.getLastImportedAt()
        );
    }
}
