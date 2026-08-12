package com.example.bulkimport.client.dto;

import java.math.BigDecimal;

public record TaxDto(String id, String name, BigDecimal percentage, String countryId, String status, long version) {
}
