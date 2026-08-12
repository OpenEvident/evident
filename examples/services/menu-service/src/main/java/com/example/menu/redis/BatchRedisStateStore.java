package com.example.menu.redis;

import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * All direct Redis access for bulk product batch coordination —
 * {@code batch:{batchId}:status} (total/completed/failed),
 * {@code batch:{batchId}:pending} (the resume list, survives a restart —
 * confirmed the real recovery mechanism per NEXT_SERVICES_DESIGN.md
 * Walkthrough 4, "scans batch:*:pending"), {@code batch:{batchId}:lock:
 * {externalId}} (SETNX+TTL, prevents double-processing during recovery),
 * and {@code batch:{batchId}:item:{externalId}} (the serialized item
 * payload — needed so recovery can actually reprocess an item, not just
 * know its externalId).
 */
@Component
public class BatchRedisStateStore {

    private static final String TOTAL = "total";
    private static final String COMPLETED = "completed";
    private static final String FAILED = "failed";

    private final StringRedisTemplate redisTemplate;

    public BatchRedisStateStore(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    public void initBatch(String batchId, int total) {
        redisTemplate.opsForHash().putAll(statusKey(batchId), Map.of(
                TOTAL, String.valueOf(total),
                COMPLETED, "0",
                FAILED, "0"
        ));
    }

    public void addPending(String batchId, String externalId, String itemPayloadJson) {
        redisTemplate.opsForSet().add(pendingKey(batchId), externalId);
        redisTemplate.opsForValue().set(itemKey(batchId, externalId), itemPayloadJson);
    }

    public void removePending(String batchId, String externalId) {
        redisTemplate.opsForSet().remove(pendingKey(batchId), externalId);
    }

    public Set<String> getPending(String batchId) {
        Set<String> members = redisTemplate.opsForSet().members(pendingKey(batchId));
        return members == null ? Set.of() : members;
    }

    public Optional<String> getItemPayload(String batchId, String externalId) {
        return Optional.ofNullable(redisTemplate.opsForValue().get(itemKey(batchId, externalId)));
    }

    public boolean tryLock(String batchId, String externalId, Duration ttl) {
        Boolean acquired = redisTemplate.opsForValue().setIfAbsent(lockKey(batchId, externalId), "1", ttl);
        return Boolean.TRUE.equals(acquired);
    }

    public void incrementCompleted(String batchId) {
        redisTemplate.opsForHash().increment(statusKey(batchId), COMPLETED, 1);
    }

    public void incrementFailed(String batchId) {
        redisTemplate.opsForHash().increment(statusKey(batchId), FAILED, 1);
    }

    public Optional<BatchStatus> getStatus(String batchId) {
        Map<Object, Object> raw = redisTemplate.opsForHash().entries(statusKey(batchId));
        if (raw.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(new BatchStatus(
                Integer.parseInt((String) raw.get(TOTAL)),
                Integer.parseInt((String) raw.get(COMPLETED)),
                Integer.parseInt((String) raw.get(FAILED))
        ));
    }

    /** Every {@code batch:{batchId}:pending} key with at least one member left — the restart-recovery scan. */
    public Set<String> findNonEmptyPendingBatchIds() {
        Set<String> keys = redisTemplate.keys("batch:*:pending");
        if (keys == null || keys.isEmpty()) {
            return Set.of();
        }
        return keys.stream()
                .filter(key -> {
                    Long size = redisTemplate.opsForSet().size(key);
                    return size != null && size > 0;
                })
                .map(this::extractBatchId)
                .collect(Collectors.toSet());
    }

    private String extractBatchId(String pendingKey) {
        String withoutPrefix = pendingKey.substring("batch:".length());
        return withoutPrefix.substring(0, withoutPrefix.length() - ":pending".length());
    }

    private String statusKey(String batchId) {
        return "batch:" + batchId + ":status";
    }

    private String pendingKey(String batchId) {
        return "batch:" + batchId + ":pending";
    }

    private String itemKey(String batchId, String externalId) {
        return "batch:" + batchId + ":item:" + externalId;
    }

    private String lockKey(String batchId, String externalId) {
        return "batch:" + batchId + ":lock:" + externalId;
    }
}
