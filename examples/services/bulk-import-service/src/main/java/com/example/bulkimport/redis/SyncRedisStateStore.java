package com.example.bulkimport.redis;

import com.example.bulkimport.domain.SyncItemAction;
import com.example.bulkimport.domain.SyncStep;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * All direct Redis access for the Sync workflow's restart-resilient,
 * per-item state machine — {@code sync:{syncId}:pending} (the resume list)
 * and {@code sync:{syncId}:item:{externalId}} (per-item step + resolved
 * refs). Kept as one small wrapper so the key shapes exist in exactly one
 * place.
 */
@Component
public class SyncRedisStateStore {

    private static final String PARTNER_ID = "partnerId";
    private static final String STEP = "step";
    private static final String CURRENCY_ID = "resolvedCurrencyId";
    private static final String TAX_IDS = "resolvedTaxIds";
    private static final String ACTION = "action";
    private static final String DISPATCHED_HASH = "dispatchedHash";
    private static final String ERROR = "error";

    private final StringRedisTemplate redisTemplate;

    public SyncRedisStateStore(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    public void addPending(String syncId, String externalId) {
        redisTemplate.opsForSet().add(pendingKey(syncId), externalId);
    }

    public void removePending(String syncId, String externalId) {
        redisTemplate.opsForSet().remove(pendingKey(syncId), externalId);
    }

    public Set<String> getPending(String syncId) {
        Set<String> members = redisTemplate.opsForSet().members(pendingKey(syncId));
        return members == null ? Set.of() : members;
    }

    public void initItem(String syncId, String externalId, String partnerId) {
        redisTemplate.opsForHash().putAll(itemKey(syncId, externalId), Map.of(
                PARTNER_ID, partnerId,
                STEP, SyncStep.RESOLVING_REFS.name()
        ));
    }

    public void setStep(String syncId, String externalId, SyncStep step) {
        redisTemplate.opsForHash().put(itemKey(syncId, externalId), STEP, step.name());
    }

    public void setResolvedRefs(String syncId, String externalId, String currencyId, List<String> taxIds) {
        redisTemplate.opsForHash().putAll(itemKey(syncId, externalId), Map.of(
                CURRENCY_ID, currencyId,
                TAX_IDS, String.join(",", taxIds)
        ));
    }

    public void setAction(String syncId, String externalId, SyncItemAction action) {
        redisTemplate.opsForHash().put(itemKey(syncId, externalId), ACTION, action.name());
    }

    public void setDispatchedHash(String syncId, String externalId, String dispatchedHash) {
        redisTemplate.opsForHash().put(itemKey(syncId, externalId), DISPATCHED_HASH, dispatchedHash);
    }

    public Optional<String> getDispatchedHash(String syncId, String externalId) {
        Object value = redisTemplate.opsForHash().get(itemKey(syncId, externalId), DISPATCHED_HASH);
        return Optional.ofNullable((String) value);
    }

    public void setError(String syncId, String externalId, String error) {
        redisTemplate.opsForHash().put(itemKey(syncId, externalId), ERROR, error);
    }

    @SuppressWarnings("unchecked")
    public Optional<SyncItemState> getItemState(String syncId, String externalId) {
        Map<Object, Object> raw = redisTemplate.opsForHash().entries(itemKey(syncId, externalId));
        if (raw.isEmpty()) {
            return Optional.empty();
        }
        Map<String, String> fields = (Map<String, String>) (Map<?, ?>) raw;
        SyncStep step = fields.containsKey(STEP) ? SyncStep.valueOf(fields.get(STEP)) : null;
        SyncItemAction action = fields.containsKey(ACTION) ? SyncItemAction.valueOf(fields.get(ACTION)) : null;
        List<String> taxIds = fields.containsKey(TAX_IDS) && !fields.get(TAX_IDS).isBlank()
                ? List.of(fields.get(TAX_IDS).split(","))
                : List.of();
        return Optional.of(new SyncItemState(
                fields.get(PARTNER_ID), step, fields.get(CURRENCY_ID), taxIds, action, fields.get(ERROR)));
    }

    /** Every {@code sync:{syncId}:pending} key with at least one member left — the restart-recovery scan. */
    public Set<String> findNonEmptyPendingSyncIds() {
        Set<String> keys = redisTemplate.keys("sync:*:pending");
        if (keys == null || keys.isEmpty()) {
            return Set.of();
        }
        return keys.stream()
                .filter(key -> {
                    Long size = redisTemplate.opsForSet().size(key);
                    return size != null && size > 0;
                })
                .map(this::extractSyncId)
                .collect(Collectors.toSet());
    }

    private String extractSyncId(String pendingKey) {
        // "sync:{syncId}:pending" -> {syncId}
        String withoutPrefix = pendingKey.substring("sync:".length());
        return withoutPrefix.substring(0, withoutPrefix.length() - ":pending".length());
    }

    private String pendingKey(String syncId) {
        return "sync:" + syncId + ":pending";
    }

    private String itemKey(String syncId, String externalId) {
        return "sync:" + syncId + ":item:" + externalId;
    }
}
