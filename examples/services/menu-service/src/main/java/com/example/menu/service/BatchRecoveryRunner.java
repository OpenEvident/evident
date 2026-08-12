package com.example.menu.service;

import com.example.menu.logging.StructuredLog;
import com.example.menu.redis.BatchRedisStateStore;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * On startup, scans {@code batch:*:pending} and resumes exactly the
 * members still left in each — the real, named recovery mechanism from
 * NEXT_SERVICES_DESIGN.md Walkthrough 4 (a mid-batch process kill/restart).
 */
@Component
public class BatchRecoveryRunner {

    private static final Logger log = LoggerFactory.getLogger(BatchRecoveryRunner.class);

    private final BatchRedisStateStore stateStore;
    private final ProductBulkOrchestrator orchestrator;

    public BatchRecoveryRunner(BatchRedisStateStore stateStore, ProductBulkOrchestrator orchestrator) {
        this.stateStore = stateStore;
        this.orchestrator = orchestrator;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void resumeLeftoverBatches() {
        Set<String> batchIds = stateStore.findNonEmptyPendingBatchIds();
        for (String batchId : batchIds) {
            int resumedCount = stateStore.getPending(batchId).size();
            StructuredLog.fields()
                    .with("batchId", batchId)
                    .with("resumedCount", String.valueOf(resumedCount))
                    .with("event", "batch.recovery.resumed")
                    .info(log, "resuming " + resumedCount + " leftover batch item(s) for " + batchId);
            orchestrator.resume(batchId);
        }
    }
}
