package com.example.menu.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

/**
 * {@code simulateItemDelayMs} is an optional, testing-only knob (default
 * unset/0) — sleeps that long per item before saving it, the same
 * established pattern {@code receiver-service}'s own {@code delayMs}
 * field used, letting a Flow spec produce a genuinely slow-but-passing or
 * timed-out outcome without guessing at real load-proportional timing.
 */
public record BulkProductRequestDto(
        @NotBlank String partnerId,
        @NotBlank String syncId,
        @NotEmpty List<@Valid BulkProductItemRequestDto> items,
        Integer simulateItemDelayMs
) {
}
