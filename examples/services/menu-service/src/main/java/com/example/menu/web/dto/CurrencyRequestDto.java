package com.example.menu.web.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record CurrencyRequestDto(@NotBlank String code, @NotBlank String name, @Min(0) int precision) {
}
