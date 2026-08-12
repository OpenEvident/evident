package com.example.publishing.web.dto;

import com.example.publishing.domain.MaterializedView;
import java.time.Instant;
import java.util.List;

public record MaterializedViewResponseDto(
        String menuId,
        String name,
        List<MaterializedProductResponseDto> products,
        Instant publishedAt
) {
    public static MaterializedViewResponseDto from(MaterializedView view) {
        return new MaterializedViewResponseDto(
                view.getMenuId(), view.getName(),
                view.getProducts().stream().map(MaterializedProductResponseDto::from).toList(),
                view.getPublishedAt());
    }
}
