package com.example.publishing.service;

import com.example.publishing.domain.AppliedTax;
import com.example.publishing.domain.MaterializedProduct;
import com.example.publishing.domain.MaterializedView;
import com.example.publishing.domain.TaxSourceLevel;
import com.example.publishing.repository.MaterializedViewRepository;
import com.example.publishing.web.dto.PublishCategoryDto;
import com.example.publishing.web.dto.PublishPriceDto;
import com.example.publishing.web.dto.PublishProductDto;
import com.example.publishing.web.dto.PublishRequestDto;
import com.example.publishing.web.dto.PublishTaxDto;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * Phase 2 — tax resolution's actual math, integer minor units, rounded to
 * the currency's precision. Rounding mode (HALF_UP) is a reasonable
 * standard default the design doc leaves unspecified; applied consistently
 * to both directions below.
 */
@Component
public class MaterializeService {

    private final TaxResolutionService taxResolutionService;
    private final MaterializedViewRepository repository;

    public MaterializeService(TaxResolutionService taxResolutionService, MaterializedViewRepository repository) {
        this.taxResolutionService = taxResolutionService;
        this.repository = repository;
    }

    public MaterializedView materialize(PublishRequestDto menu) {
        Map<String, PublishTaxDto> taxesById = menu.taxes().stream()
                .collect(java.util.stream.Collectors.toMap(PublishTaxDto::taxId, t -> t));

        List<MaterializedProduct> products = menu.categories().stream()
                .flatMap(category -> category.products().stream()
                        .map(product -> materializeProduct(menu, category, product, taxesById)))
                .toList();

        MaterializedView view = new MaterializedView(menu.menuId(), menu.name(), products, Instant.now());
        return upsert(view);
    }

    private MaterializedProduct materializeProduct(
            PublishRequestDto menu, PublishCategoryDto category, PublishProductDto product, Map<String, PublishTaxDto> taxesById
    ) {
        PublishPriceDto priceLeg = product.prices().stream()
                .filter(p -> p.currencyId().equals(menu.currencyId()))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException(
                        "product " + product.productId() + " has no price leg for " + menu.currencyId()
                                + " — validation should have caught this"));

        TaxResolution resolution = taxResolutionService.resolveApplicableTaxes(priceLeg, category, menu, taxesById);
        List<PublishTaxDto> countryFiltered = taxResolutionService.filterByCountry(resolution.taxes(), menu.countryId());

        BigDecimal ratePercent = countryFiltered.stream()
                .map(PublishTaxDto::percentage)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal rate = ratePercent.divide(BigDecimal.valueOf(100), 10, RoundingMode.HALF_UP);

        int amount = priceLeg.amount();
        int unitPrice;
        int taxAmount;
        int priceInclTax;
        if (priceLeg.taxInclusive()) {
            priceInclTax = amount;
            unitPrice = BigDecimal.valueOf(amount)
                    .divide(BigDecimal.ONE.add(rate), 0, RoundingMode.HALF_UP)
                    .intValueExact();
            taxAmount = priceInclTax - unitPrice;
        } else {
            unitPrice = amount;
            taxAmount = BigDecimal.valueOf(unitPrice).multiply(rate).setScale(0, RoundingMode.HALF_UP).intValueExact();
            priceInclTax = unitPrice + taxAmount;
        }

        List<AppliedTax> appliedTaxes = countryFiltered.stream()
                .map(t -> new AppliedTax(t.taxId(), t.name(), t.percentage()))
                .toList();
        TaxSourceLevel effectiveLevel = countryFiltered.isEmpty() ? TaxSourceLevel.NONE : resolution.level();

        return new MaterializedProduct(
                product.productId(), product.sku(), product.name(), unitPrice, taxAmount, priceInclTax,
                appliedTaxes, effectiveLevel);
    }

    private MaterializedView upsert(MaterializedView view) {
        return repository.findByMenuId(view.getMenuId())
                .map(existing -> {
                    repository.deleteById(existing.getId());
                    return repository.save(view);
                })
                .orElseGet(() -> repository.save(view));
    }
}
