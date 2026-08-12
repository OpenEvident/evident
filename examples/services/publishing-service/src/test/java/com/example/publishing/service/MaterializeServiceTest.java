package com.example.publishing.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.example.publishing.domain.MaterializedView;
import com.example.publishing.domain.TaxSourceLevel;
import com.example.publishing.repository.MaterializedViewRepository;
import com.example.publishing.web.dto.PublishCategoryDto;
import com.example.publishing.web.dto.PublishPriceDto;
import com.example.publishing.web.dto.PublishProductDto;
import com.example.publishing.web.dto.PublishRequestDto;
import com.example.publishing.web.dto.PublishTaxDto;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class MaterializeServiceTest {

    @Mock
    private MaterializedViewRepository repository;

    private MaterializeService materializeService;

    @BeforeEach
    void setUp() {
        materializeService = new MaterializeService(new TaxResolutionService(), repository);
        org.mockito.Mockito.lenient().when(repository.findByMenuId(org.mockito.ArgumentMatchers.anyString())).thenReturn(Optional.empty());
        when(repository.save(any(MaterializedView.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    /** The doc's own worked example: 1300 (13.00 AED), exclusive, resolves at MENU level, 5% AE VAT. */
    @Test
    void docWorkedExampleMatchesExactly() {
        PublishTaxDto uaeVat = tax("tax_vat_ae_001", "UAE VAT", "5.00", "cty_ae_001");
        PublishPriceDto price = new PublishPriceDto("cur_aed_001", 1300, false, List.of());
        PublishProductDto product = new PublishProductDto("prod_1", "SKU-1", "Cheeseburger", List.of(price));
        PublishCategoryDto category = new PublishCategoryDto("cat_1", "Burgers", List.of(), List.of(product));
        PublishRequestDto menu = new PublishRequestDto(
                "menu_1", "Summer Menu", "cty_ae_001", "cur_aed_001", 2,
                List.of("tax_vat_ae_001"), true, List.of(category), List.of(uaeVat));

        MaterializedView view = materializeService.materialize(menu);

        var result = view.getProducts().get(0);
        assertThat(result.unitPrice()).isEqualTo(1300);
        assertThat(result.taxAmount()).isEqualTo(65);
        assertThat(result.priceInclTax()).isEqualTo(1365);
        assertThat(result.taxSourceLevel()).isEqualTo(TaxSourceLevel.MENU);
    }

    @Test
    void productLevelTaxWinsOverCategoryAndMenuLevel() {
        PublishTaxDto productTax = tax("tax_p", "Product Tax", "10.00", null);
        PublishTaxDto categoryTax = tax("tax_c", "Category Tax", "20.00", null);
        PublishTaxDto menuTax = tax("tax_m", "Menu Tax", "30.00", null);

        PublishPriceDto price = new PublishPriceDto("cur_aed_001", 1000, false, List.of("tax_p"));
        PublishProductDto product = new PublishProductDto("prod_1", "SKU-1", "Item", List.of(price));
        PublishCategoryDto category = new PublishCategoryDto("cat_1", "Cat", List.of("tax_c"), List.of(product));
        PublishRequestDto menu = new PublishRequestDto(
                "menu_1", "Menu", "cty_ae_001", "cur_aed_001", 2,
                List.of("tax_m"), true, List.of(category), List.of(productTax, categoryTax, menuTax));

        var result = materializeService.materialize(menu).getProducts().get(0);

        assertThat(result.taxSourceLevel()).isEqualTo(TaxSourceLevel.PRODUCT);
        assertThat(result.taxAmount()).isEqualTo(100); // 10% of 1000, not 20% or 30%
    }

    @Test
    void categoryLevelWinsWhenProductLevelIsEmpty() {
        PublishTaxDto categoryTax = tax("tax_c", "Category Tax", "20.00", null);
        PublishTaxDto menuTax = tax("tax_m", "Menu Tax", "30.00", null);

        PublishPriceDto price = new PublishPriceDto("cur_aed_001", 1000, false, List.of());
        PublishProductDto product = new PublishProductDto("prod_1", "SKU-1", "Item", List.of(price));
        PublishCategoryDto category = new PublishCategoryDto("cat_1", "Cat", List.of("tax_c"), List.of(product));
        PublishRequestDto menu = new PublishRequestDto(
                "menu_1", "Menu", "cty_ae_001", "cur_aed_001", 2,
                List.of("tax_m"), true, List.of(category), List.of(categoryTax, menuTax));

        var result = materializeService.materialize(menu).getProducts().get(0);

        assertThat(result.taxSourceLevel()).isEqualTo(TaxSourceLevel.CATEGORY);
        assertThat(result.taxAmount()).isEqualTo(200); // 20% of 1000
    }

    @Test
    void countryMismatchedTaxIsSilentlyExcludedNotAHardFailure() {
        PublishTaxDto wrongCountryTax = tax("tax_gb", "UK VAT", "20.00", "cty_gb_001");
        PublishPriceDto price = new PublishPriceDto("cur_aed_001", 1000, false, List.of());
        PublishProductDto product = new PublishProductDto("prod_1", "SKU-1", "Item", List.of(price));
        PublishCategoryDto category = new PublishCategoryDto("cat_1", "Cat", List.of(), List.of(product));
        PublishRequestDto menu = new PublishRequestDto(
                "menu_1", "Menu", "cty_ae_001", "cur_aed_001", 2,
                List.of("tax_gb"), true, List.of(category), List.of(wrongCountryTax));

        var result = materializeService.materialize(menu).getProducts().get(0);

        assertThat(result.taxAmount()).isZero();
        assertThat(result.unitPrice()).isEqualTo(1000);
        assertThat(result.priceInclTax()).isEqualTo(1000);
        assertThat(result.taxSourceLevel()).isEqualTo(TaxSourceLevel.NONE);
    }

    @Test
    void taxInclusivePriceIsBackedOutCorrectly() {
        // 1365 inclusive of 5% -> unitPrice 1300, taxAmount 65 (the inverse of the doc's worked example)
        PublishTaxDto uaeVat = tax("tax_vat_ae_001", "UAE VAT", "5.00", "cty_ae_001");
        PublishPriceDto price = new PublishPriceDto("cur_aed_001", 1365, true, List.of("tax_vat_ae_001"));
        PublishProductDto product = new PublishProductDto("prod_1", "SKU-1", "Item", List.of(price));
        PublishCategoryDto category = new PublishCategoryDto("cat_1", "Cat", List.of(), List.of(product));
        PublishRequestDto menu = new PublishRequestDto(
                "menu_1", "Menu", "cty_ae_001", "cur_aed_001", 2,
                List.of(), false, List.of(category), List.of(uaeVat));

        var result = materializeService.materialize(menu).getProducts().get(0);

        assertThat(result.priceInclTax()).isEqualTo(1365);
        assertThat(result.unitPrice()).isEqualTo(1300);
        assertThat(result.taxAmount()).isEqualTo(65);
    }

    @Test
    void noApplicableTaxAtAnyLevelLeavesPriceUnchanged() {
        PublishPriceDto price = new PublishPriceDto("cur_aed_001", 500, false, List.of());
        PublishProductDto product = new PublishProductDto("prod_1", "SKU-1", "Item", List.of(price));
        PublishCategoryDto category = new PublishCategoryDto("cat_1", "Cat", List.of(), List.of(product));
        PublishRequestDto menu = new PublishRequestDto(
                "menu_1", "Menu", "cty_ae_001", "cur_aed_001", 2,
                List.of(), false, List.of(category), List.of());

        var result = materializeService.materialize(menu).getProducts().get(0);

        assertThat(result.unitPrice()).isEqualTo(500);
        assertThat(result.taxAmount()).isZero();
        assertThat(result.priceInclTax()).isEqualTo(500);
        assertThat(result.taxSourceLevel()).isEqualTo(TaxSourceLevel.NONE);
    }

    private PublishTaxDto tax(String id, String name, String percentage, String countryId) {
        return new PublishTaxDto(id, name, new BigDecimal(percentage), countryId, "ACTIVE");
    }
}
