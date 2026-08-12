package com.example.menu.client.dto;

import java.math.BigDecimal;

public record PublishTaxDto(String taxId, String name, BigDecimal percentage, String countryId, String status) {
}
