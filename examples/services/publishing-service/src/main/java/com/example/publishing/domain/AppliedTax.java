package com.example.publishing.domain;

import java.math.BigDecimal;

public record AppliedTax(String taxId, String name, BigDecimal percentage) {
}
