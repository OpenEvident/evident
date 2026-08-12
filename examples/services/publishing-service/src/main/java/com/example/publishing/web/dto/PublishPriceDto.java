package com.example.publishing.web.dto;

import java.util.List;

public record PublishPriceDto(String currencyId, int amount, boolean taxInclusive, List<String> taxIds) {
}
