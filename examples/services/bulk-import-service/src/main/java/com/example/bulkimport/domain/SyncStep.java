package com.example.bulkimport.domain;

public enum SyncStep {
    RESOLVING_REFS,
    CHECKING_SYNC_HASH,
    DISPATCHING,
    AWAITING_RESULT,
    DONE,
    SKIPPED,
    FAILED
}
