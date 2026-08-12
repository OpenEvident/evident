package com.example.menu.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record CategoryRequestDto(@NotBlank String name, @NotNull List<String> taxIds) {
}
