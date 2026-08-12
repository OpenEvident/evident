package com.example.bulkimport.client.dto;

import java.util.List;

/**
 * {@code syncId} rides along opaquely so menu-service can echo it back in
 * each item's {@code POST /imports/products/{externalId}/sync-result}
 * callback — menu-service never interprets it, just passes it through.
 */
public record BulkProductRequestDto(String partnerId, String syncId, List<BulkProductItemDto> items) {
}
