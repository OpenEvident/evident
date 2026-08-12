package com.example.menu.web.dto;

import jakarta.validation.constraints.NotBlank;

public record CountryRequestDto(@NotBlank String code, @NotBlank String name, @NotBlank String defaultCurrencyId) {
}
