package com.example.menu.web.dto;

import com.example.menu.domain.Currency;
import com.example.menu.domain.ReferenceStatus;

public record CurrencyResponseDto(String id, String code, String name, int precision, ReferenceStatus status) {
    public static CurrencyResponseDto from(Currency currency) {
        return new CurrencyResponseDto(
                currency.getId(), currency.getCode(), currency.getName(), currency.getPrecision(), currency.getStatus());
    }
}
