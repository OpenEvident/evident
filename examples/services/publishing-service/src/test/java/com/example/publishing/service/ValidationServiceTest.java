package com.example.publishing.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.publishing.web.dto.PublishCategoryDto;
import com.example.publishing.web.dto.PublishPriceDto;
import com.example.publishing.web.dto.PublishProductDto;
import com.example.publishing.web.dto.PublishRequestDto;
import com.example.publishing.web.dto.PublishTaxDto;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

class ValidationServiceTest {

    private final ValidationService validationService = new ValidationService(new TaxResolutionService());

    @Test
    void passesCleanlyWhenEverythingResolves() {
        PublishTaxDto tax = tax("tax_1", "5.00", "ACTIVE", null);
        PublishPriceDto price = new PublishPriceDto("cur_aed_001", 1000, false, List.of("tax_1"));
        PublishProductDto product = new PublishProductDto("prod_1", "SKU-1", "Item", List.of(price));
        PublishCategoryDto category = new PublishCategoryDto("cat_1", "Cat", List.of(), List.of(product));
        PublishRequestDto menu = menu(category, tax);

        assertThat(validationService.validate(menu)).isEmpty();
    }

    @Test
    void failsWhenNoPriceLegMatchesTheMenuCurrency() {
        PublishPriceDto price = new PublishPriceDto("cur_usd_001", 1000, false, List.of());
        PublishProductDto product = new PublishProductDto("prod_1", "SKU-1", "Item", List.of(price));
        PublishCategoryDto category = new PublishCategoryDto("cat_1", "Cat", List.of(), List.of(product));
        PublishRequestDto menu = menu(category);

        assertThat(validationService.validate(menu)).anyMatch(e -> e.contains("no price leg"));
    }

    @Test
    void failsWhenNameIsBlank() {
        PublishPriceDto price = new PublishPriceDto("cur_aed_001", 1000, false, List.of());
        PublishProductDto product = new PublishProductDto("prod_1", "SKU-1", "  ", List.of(price));
        PublishCategoryDto category = new PublishCategoryDto("cat_1", "Cat", List.of(), List.of(product));
        PublishRequestDto menu = menu(category);

        assertThat(validationService.validate(menu)).anyMatch(e -> e.contains("name must not be blank"));
    }

    @Test
    void failsWhenAReferencedTaxIsInactive() {
        PublishTaxDto inactiveTax = tax("tax_1", "5.00", "INACTIVE", null);
        PublishPriceDto price = new PublishPriceDto("cur_aed_001", 1000, false, List.of("tax_1"));
        PublishProductDto product = new PublishProductDto("prod_1", "SKU-1", "Item", List.of(price));
        PublishCategoryDto category = new PublishCategoryDto("cat_1", "Cat", List.of(), List.of(product));
        PublishRequestDto menu = menu(category, inactiveTax);

        assertThat(validationService.validate(menu)).anyMatch(e -> e.contains("not ACTIVE"));
    }

    @Test
    void failsWhenAReferencedTaxIsMissingFromThePayload() {
        PublishPriceDto price = new PublishPriceDto("cur_aed_001", 1000, false, List.of("tax_missing"));
        PublishProductDto product = new PublishProductDto("prod_1", "SKU-1", "Item", List.of(price));
        PublishCategoryDto category = new PublishCategoryDto("cat_1", "Cat", List.of(), List.of(product));
        PublishRequestDto menu = menu(category);

        assertThat(validationService.validate(menu)).anyMatch(e -> e.contains("was not found"));
    }

    @Test
    void aCountryMismatchedTaxIsNotAValidationFailure() {
        PublishTaxDto wrongCountryTax = tax("tax_1", "5.00", "ACTIVE", "cty_gb_001");
        PublishPriceDto price = new PublishPriceDto("cur_aed_001", 1000, false, List.of("tax_1"));
        PublishProductDto product = new PublishProductDto("prod_1", "SKU-1", "Item", List.of(price));
        PublishCategoryDto category = new PublishCategoryDto("cat_1", "Cat", List.of(), List.of(product));
        PublishRequestDto menu = menu(category, wrongCountryTax);

        assertThat(validationService.validate(menu)).isEmpty();
    }

    private PublishRequestDto menu(PublishCategoryDto category, PublishTaxDto... taxes) {
        return new PublishRequestDto(
                "menu_1", "Menu", "cty_ae_001", "cur_aed_001", 2,
                List.of(), false, List.of(category), List.of(taxes));
    }

    private PublishTaxDto tax(String id, String percentage, String status, String countryId) {
        return new PublishTaxDto(id, "Tax", new BigDecimal(percentage), countryId, status);
    }
}
