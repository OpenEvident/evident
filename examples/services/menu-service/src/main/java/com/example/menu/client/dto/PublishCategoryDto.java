package com.example.menu.client.dto;

import java.util.List;

public record PublishCategoryDto(String categoryId, String name, List<String> taxIds, List<PublishProductDto> products) {
}
