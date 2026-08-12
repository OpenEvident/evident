package com.example.publishing.service;

import com.example.publishing.web.dto.PublishCategoryDto;
import com.example.publishing.web.dto.PublishPriceDto;
import com.example.publishing.web.dto.PublishProductDto;
import com.example.publishing.web.dto.PublishRequestDto;
import com.example.publishing.web.dto.PublishTaxDto;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * Phase 1 — collect every error across the whole menu; any single failure
 * fails the whole menu, which never reaches {@link MaterializeService}.
 */
@Component
public class ValidationService {

    private final TaxResolutionService taxResolutionService;

    public ValidationService(TaxResolutionService taxResolutionService) {
        this.taxResolutionService = taxResolutionService;
    }

    public List<String> validate(PublishRequestDto menu) {
        List<String> errors = new ArrayList<>();
        Map<String, PublishTaxDto> taxesById = menu.taxes().stream()
                .collect(java.util.stream.Collectors.toMap(PublishTaxDto::taxId, t -> t));

        for (PublishCategoryDto category : menu.categories()) {
            for (PublishProductDto product : category.products()) {
                validateProduct(menu, category, product, taxesById, errors);
            }
        }
        return errors;
    }

    private void validateProduct(
            PublishRequestDto menu, PublishCategoryDto category, PublishProductDto product,
            Map<String, PublishTaxDto> taxesById, List<String> errors
    ) {
        String productId = product.productId() == null ? "(unknown)" : product.productId();

        if (product.name() == null || product.name().isBlank()) {
            errors.add("product " + productId + ": name must not be blank");
        }
        if (product.sku() == null || product.sku().isBlank()) {
            errors.add("product " + productId + ": sku must not be blank");
        }

        Optional<PublishPriceDto> priceLeg = product.prices().stream()
                .filter(p -> p.currencyId().equals(menu.currencyId()))
                .findFirst();
        if (priceLeg.isEmpty()) {
            errors.add("product " + productId + ": no price leg for currency " + menu.currencyId());
            return; // nothing further to check without a price leg
        }

        for (String taxId : taxResolutionService.winningTaxIds(priceLeg.get(), category, menu)) {
            PublishTaxDto tax = taxesById.get(taxId);
            if (tax == null) {
                errors.add("product " + productId + ": referenced tax " + taxId + " was not found in the payload");
            } else if (!"ACTIVE".equals(tax.status())) {
                errors.add("product " + productId + ": referenced tax " + taxId + " is not ACTIVE");
            }
        }
    }
}
