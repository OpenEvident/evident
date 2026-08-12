package com.example.bulkimport.client.dto;

import java.math.BigDecimal;

/**
 * Body for {@code POST /taxes} when bulk-import-service's Sync workflow
 * finds no existing tax matching a partner's raw {@code {name,
 * percentage}} assignment. Created taxes are always global (no
 * {@code countryId}) — the raw feed carries no country information to
 * scope it to.
 */
public record TaxCreateRequestDto(String name, BigDecimal percentage) {
}
