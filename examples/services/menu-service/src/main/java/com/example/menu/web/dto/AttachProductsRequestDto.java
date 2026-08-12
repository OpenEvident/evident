package com.example.menu.web.dto;

import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record AttachProductsRequestDto(@NotEmpty List<String> productIds) {
}
