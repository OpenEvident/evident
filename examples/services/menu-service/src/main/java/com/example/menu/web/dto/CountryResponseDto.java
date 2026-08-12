package com.example.menu.web.dto;

import com.example.menu.domain.Country;
import com.example.menu.domain.ReferenceStatus;

public record CountryResponseDto(String id, String code, String name, String defaultCurrencyId, ReferenceStatus status) {
    public static CountryResponseDto from(Country country) {
        return new CountryResponseDto(
                country.getId(), country.getCode(), country.getName(), country.getDefaultCurrencyId(), country.getStatus());
    }
}
