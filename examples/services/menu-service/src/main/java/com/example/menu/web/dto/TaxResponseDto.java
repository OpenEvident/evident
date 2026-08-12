package com.example.menu.web.dto;

import com.example.menu.domain.ReferenceStatus;
import com.example.menu.domain.Tax;
import java.math.BigDecimal;

public record TaxResponseDto(
        String id, String name, BigDecimal percentage, String countryId, ReferenceStatus status, long version
) {
    public static TaxResponseDto from(Tax tax) {
        return new TaxResponseDto(
                tax.getId(), tax.getName(), tax.getPercentage(), tax.getCountryId(), tax.getStatus(), tax.getVersion());
    }
}
