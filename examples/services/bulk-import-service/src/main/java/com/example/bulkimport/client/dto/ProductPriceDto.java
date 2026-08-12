package com.example.bulkimport.client.dto;

import java.util.List;

public record ProductPriceDto(String currencyId, int amount, boolean taxInclusive, List<String> taxIds) {
}
