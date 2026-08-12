package com.example.menu.web.dto;

import jakarta.validation.constraints.NotBlank;
import java.util.List;

/**
 * Fired by publishing-service back to menu-service once it finishes
 * validating and (if valid) materializing — publishing-service's own
 * {@code POST /publish} is itself async (202 immediately), so this
 * callback is how menu-service learns the real outcome, the same
 * async-trigger-plus-callback pattern already used between
 * bulk-import-service and menu-service.
 */
public record PublishResultCallbackDto(@NotBlank String status, List<String> errors) {
}
