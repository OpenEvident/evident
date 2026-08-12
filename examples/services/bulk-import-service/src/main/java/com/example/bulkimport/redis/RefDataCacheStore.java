package com.example.bulkimport.redis;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * Redis-backed cache of currency/tax lookups sourced from menu-service —
 * {@code cache:currency:{code}} and {@code cache:tax:{name}:{percentage}},
 * TTL-bound so reference-data edits in menu-service eventually propagate
 * without bulk-import-service needing its own invalidation mechanism.
 */
@Component
public class RefDataCacheStore {

    private final StringRedisTemplate redisTemplate;
    private final Duration ttl;

    public RefDataCacheStore(
            StringRedisTemplate redisTemplate,
            @Value("${bulk-import.ref-data-cache-ttl-seconds}") long ttlSeconds
    ) {
        this.redisTemplate = redisTemplate;
        this.ttl = Duration.ofSeconds(ttlSeconds);
    }

    public Optional<CachedCurrency> getCurrency(String currencyCode) {
        String raw = redisTemplate.opsForValue().get(currencyKey(currencyCode));
        return raw == null ? Optional.empty() : Optional.of(CachedCurrency.decode(raw));
    }

    public void putCurrency(String currencyCode, CachedCurrency currency) {
        redisTemplate.opsForValue().set(currencyKey(currencyCode), currency.encode(), ttl);
    }

    public Optional<String> getTaxId(String name, BigDecimal percentage) {
        return Optional.ofNullable(redisTemplate.opsForValue().get(taxKey(name, percentage)));
    }

    public void putTaxId(String name, BigDecimal percentage, String taxId) {
        redisTemplate.opsForValue().set(taxKey(name, percentage), taxId, ttl);
    }

    private String currencyKey(String code) {
        return "cache:currency:" + code;
    }

    private String taxKey(String name, BigDecimal percentage) {
        return "cache:tax:" + name + ":" + percentage.stripTrailingZeros().toPlainString();
    }
}
