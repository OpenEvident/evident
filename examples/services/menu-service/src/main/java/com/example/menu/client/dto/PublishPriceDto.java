package com.example.menu.client.dto;

import java.util.List;

public record PublishPriceDto(String currencyId, int amount, boolean taxInclusive, List<String> taxIds) {
}
