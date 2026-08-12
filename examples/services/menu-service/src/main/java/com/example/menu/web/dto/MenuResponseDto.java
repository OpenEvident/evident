package com.example.menu.web.dto;

import com.example.menu.domain.Menu;
import com.example.menu.domain.MenuStatus;
import java.time.Instant;
import java.util.List;

public record MenuResponseDto(
        String menuId,
        String partnerId,
        String name,
        String countryId,
        String currencyId,
        List<String> taxIds,
        boolean applyMenuLevelTax,
        List<CategoryResponseDto> categories,
        MenuStatus status,
        long version,
        Instant createdAt,
        Instant publishedAt
) {
    public static MenuResponseDto from(Menu menu) {
        return new MenuResponseDto(
                menu.getMenuId(), menu.getPartnerId(), menu.getName(), menu.getCountryId(), menu.getCurrencyId(),
                menu.getTaxIds(), menu.isApplyMenuLevelTax(),
                menu.getCategories().stream().map(CategoryResponseDto::from).toList(),
                menu.getStatus(), menu.getVersion(), menu.getCreatedAt(), menu.getPublishedAt());
    }
}
