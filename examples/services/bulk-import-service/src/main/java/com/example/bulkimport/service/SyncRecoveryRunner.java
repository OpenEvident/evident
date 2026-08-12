package com.example.bulkimport.service;

import com.example.bulkimport.logging.StructuredLog;
import com.example.bulkimport.redis.SyncRedisStateStore;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * On startup, resumes any Sync workflow left with non-empty
 * {@code sync:{syncId}:pending} from before a restart — the per-item state
 * machine in Redis already records exactly which step each leftover item
 * was on, so re-driving it through {@link SyncWorkflowService#resume} picks
 * up safely rather than starting the whole batch over.
 */
@Component
public class SyncRecoveryRunner {

    private static final Logger log = LoggerFactory.getLogger(SyncRecoveryRunner.class);

    private final SyncRedisStateStore stateStore;
    private final SyncWorkflowService syncWorkflowService;

    public SyncRecoveryRunner(SyncRedisStateStore stateStore, SyncWorkflowService syncWorkflowService) {
        this.stateStore = stateStore;
        this.syncWorkflowService = syncWorkflowService;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void resumeLeftoverSyncs() {
        Set<String> syncIds = stateStore.findNonEmptyPendingSyncIds();
        for (String syncId : syncIds) {
            int resumedCount = stateStore.getPending(syncId).size();
            StructuredLog.fields()
                    .with("syncId", syncId)
                    .with("resumedCount", String.valueOf(resumedCount))
                    .with("event", "sync.recovery.resumed")
                    .info(log, "resuming " + resumedCount + " leftover sync item(s) for " + syncId);
            syncWorkflowService.resume(syncId);
        }
    }
}
