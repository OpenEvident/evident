package com.example.menu.web.dto;

public record BulkStatusResponseDto(String batchId, int total, int completed, int failed, String status) {
}
