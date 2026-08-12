package com.example.publishing.service;

import com.example.publishing.client.MenuServiceCallbackClient;
import com.example.publishing.domain.MaterializedView;
import com.example.publishing.logging.StructuredLog;
import com.example.publishing.web.dto.PublishRequestDto;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

/**
 * Ties Phase 1 (validate) and Phase 2 (materialize) together — runs async,
 * since {@code POST /publish} itself responds 202 immediately and the real
 * outcome is signaled by log lines plus the publish-result callback to
 * menu-service.
 */
@Service
public class PublishOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(PublishOrchestrator.class);

    private final ValidationService validationService;
    private final MaterializeService materializeService;
    private final MenuServiceCallbackClient callbackClient;

    public PublishOrchestrator(
            ValidationService validationService,
            MaterializeService materializeService,
            MenuServiceCallbackClient callbackClient
    ) {
        this.validationService = validationService;
        this.materializeService = materializeService;
        this.callbackClient = callbackClient;
    }

    @Async
    public void process(PublishRequestDto request) {
        List<String> errors = validationService.validate(request);

        if (!errors.isEmpty()) {
            StructuredLog.fields()
                    .with("menuId", request.menuId())
                    .with("errors", String.join(" | ", errors))
                    .with("event", "menu.validation_failed")
                    .warn(log, "validation failed for " + request.menuId() + ": " + errors.size() + " error(s)");
            callbackClient.sendPublishResult(request.menuId(), "VALIDATION_FAILED", errors);
            return;
        }

        MaterializedView view = materializeService.materialize(request);
        StructuredLog.fields()
                .with("menuId", request.menuId())
                .with("productCount", String.valueOf(view.getProducts().size()))
                .with("event", "menu.published")
                .info(log, "published " + request.menuId() + " with " + view.getProducts().size() + " product(s)");
        callbackClient.sendPublishResult(request.menuId(), "PUBLISHED", null);
    }
}
