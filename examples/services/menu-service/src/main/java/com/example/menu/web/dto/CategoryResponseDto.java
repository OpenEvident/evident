package com.example.menu.web.dto;

import com.example.menu.domain.Category;
import java.util.List;

public record CategoryResponseDto(String categoryId, String name, List<String> taxIds, List<String> productIds) {
    public static CategoryResponseDto from(Category category) {
        return new CategoryResponseDto(
                category.getCategoryId(), category.getName(), category.getTaxIds(), category.getProductIds());
    }
}
