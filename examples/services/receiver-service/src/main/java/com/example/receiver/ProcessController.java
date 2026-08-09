package com.example.receiver;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ProcessController {

    private static final Logger log = LoggerFactory.getLogger(ProcessController.class);

    @PostMapping("/process")
    public ResponseEntity<Void> process(@RequestBody ProcessRequest request) throws InterruptedException {
        /* Structured JSON logging (application.yml) includes every MDC key as a
         * top-level field — this is what makes recordId a structured, exact-match
         * field instead of just text inside the log message (docs/architecture.md §5). */
        MDC.put("recordId", request.recordId());
        try {
            log.info("received record {} — processing with delayMs={}", request.recordId(), request.delayMs());

            if (request.delayMs() > 0) {
                Thread.sleep(request.delayMs());
            }

            log.info("processed record {}", request.recordId());
            return ResponseEntity.ok().build();
        } finally {
            MDC.remove("recordId");
        }
    }
}
