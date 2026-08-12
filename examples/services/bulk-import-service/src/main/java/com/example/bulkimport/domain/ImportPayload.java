package com.example.bulkimport.domain;

import java.math.BigDecimal;

/**
 * The raw, partner-supplied product fields — codes and names only, no real
 * menu-service IDs. {@code contentHash} (see {@code HashService}) is
 * computed over exactly these fields, nothing else, so that fields added
 * later by the Sync workflow (like a resolved {@code productId}) can never
 * make an unchanged item look "changed".
 */
public record ImportPayload(
        String sku,
        String name,
        BigDecimal price,
        String currencyCode,
        TaxAssignment taxAssignment
) {
}
