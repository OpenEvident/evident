package com.example.bulkimport.domain;

import java.math.BigDecimal;

/**
 * Raw tax assertion as it arrives from the partner feed — a name/percentage
 * pair, not yet resolved to a real {@code taxId}. Resolution happens only
 * during the Sync workflow (see {@code SyncWorkflowService}), never here.
 */
public record TaxAssignment(String name, BigDecimal percentage) {
}
