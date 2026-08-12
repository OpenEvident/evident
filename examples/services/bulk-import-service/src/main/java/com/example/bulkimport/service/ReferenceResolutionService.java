package com.example.bulkimport.service;

import com.example.bulkimport.client.MenuServiceClient;
import com.example.bulkimport.client.dto.CurrencyDto;
import com.example.bulkimport.client.dto.TaxDto;
import com.example.bulkimport.domain.ImportPayload;
import com.example.bulkimport.domain.TaxAssignment;
import com.example.bulkimport.redis.CachedCurrency;
import com.example.bulkimport.redis.RefDataCacheStore;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * The Sync workflow's {@code RESOLVING_REFS} step — resolves a raw
 * {@code currencyCode}/{@code taxAssignment} against menu-service, via a
 * Redis-backed cache first. Tax resolution is find-or-create: a name+
 * percentage pair with no existing match is created in menu-service as a
 * new, globally-scoped tax.
 */
@Component
public class ReferenceResolutionService {

    private final MenuServiceClient menuServiceClient;
    private final RefDataCacheStore cache;

    public ReferenceResolutionService(MenuServiceClient menuServiceClient, RefDataCacheStore cache) {
        this.menuServiceClient = menuServiceClient;
        this.cache = cache;
    }

    public ResolvedRefs resolve(ImportPayload payload) {
        CachedCurrency currency = resolveCurrency(payload.currencyCode());
        String taxId = resolveTax(payload.taxAssignment());
        return new ResolvedRefs(currency.currencyId(), currency.precision(), List.of(taxId));
    }

    private CachedCurrency resolveCurrency(String currencyCode) {
        Optional<CachedCurrency> cached = cache.getCurrency(currencyCode);
        if (cached.isPresent()) {
            return cached.get();
        }
        CurrencyDto found = menuServiceClient.findCurrencyByCode(currencyCode)
                .orElseThrow(() -> new ReferenceResolutionException("no currency found for code=" + currencyCode));
        CachedCurrency resolved = new CachedCurrency(found.id(), found.precision());
        cache.putCurrency(currencyCode, resolved);
        return resolved;
    }

    private String resolveTax(TaxAssignment assignment) {
        String name = assignment.name();
        BigDecimal percentage = assignment.percentage();

        Optional<String> cached = cache.getTaxId(name, percentage);
        if (cached.isPresent()) {
            return cached.get();
        }

        Optional<TaxDto> found = menuServiceClient.findTax(name, percentage);
        String taxId = found.map(TaxDto::id).orElseGet(() -> menuServiceClient.createTax(name, percentage).id());
        cache.putTaxId(name, percentage, taxId);
        return taxId;
    }
}
