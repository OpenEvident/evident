package com.example.menu.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.example.menu.client.PublishingServiceClient;
import com.example.menu.client.dto.PublishRequestDto;
import com.example.menu.domain.Category;
import com.example.menu.domain.Currency;
import com.example.menu.domain.Menu;
import com.example.menu.domain.MenuStatus;
import com.example.menu.domain.Product;
import com.example.menu.domain.ProductPrice;
import com.example.menu.domain.ProductStatus;
import com.example.menu.domain.ReferenceStatus;
import com.example.menu.domain.Tax;
import com.example.menu.repository.CurrencyRepository;
import com.example.menu.repository.MenuRepository;
import com.example.menu.repository.ProductRepository;
import com.example.menu.repository.TaxRepository;
import com.example.menu.web.dto.CategoryRequestDto;
import com.example.menu.web.dto.PublishResultCallbackDto;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class MenuServiceTest {

    @Mock
    private MenuRepository menuRepository;
    @Mock
    private ProductRepository productRepository;
    @Mock
    private CurrencyRepository currencyRepository;
    @Mock
    private TaxRepository taxRepository;
    @Mock
    private PublishingServiceClient publishingServiceClient;

    private MenuService menuService;

    @BeforeEach
    void setUp() {
        menuService = new MenuService(
                menuRepository, productRepository, currencyRepository, taxRepository, publishingServiceClient, new IdGenerator());
        org.mockito.Mockito.lenient().when(menuRepository.save(any(Menu.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void deleteSoftDeletesRatherThanRemovingTheDocument() {
        Menu menu = menu(List.of());
        when(menuRepository.findByMenuId("menu_1")).thenReturn(Optional.of(menu));

        menuService.delete("menu_1");

        ArgumentCaptor<Menu> captor = ArgumentCaptor.forClass(Menu.class);
        org.mockito.Mockito.verify(menuRepository).save(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(MenuStatus.DELETED);
        org.mockito.Mockito.verify(menuRepository, org.mockito.Mockito.never()).deleteById(any());
    }

    @Test
    void attachProductsMergesWithoutDuplicatesAndOnlyIntoTheNamedCategory() {
        Category burgers = new Category("cat_burgers", "Burgers", List.of(), List.of("prod_1"));
        Category drinks = new Category("cat_drinks", "Drinks", List.of(), List.of());
        Menu menu = menu(List.of(burgers, drinks));
        when(menuRepository.findByMenuId("menu_1")).thenReturn(Optional.of(menu));
        when(productRepository.findByProductId("prod_1")).thenReturn(Optional.of(mockProduct("prod_1")));
        when(productRepository.findByProductId("prod_2")).thenReturn(Optional.of(mockProduct("prod_2")));

        Menu updated = menuService.attachProducts("menu_1", "cat_burgers", List.of("prod_1", "prod_2"));

        Category updatedBurgers = updated.getCategories().stream()
                .filter(c -> c.getCategoryId().equals("cat_burgers")).findFirst().orElseThrow();
        Category updatedDrinks = updated.getCategories().stream()
                .filter(c -> c.getCategoryId().equals("cat_drinks")).findFirst().orElseThrow();
        assertThat(updatedBurgers.getProductIds()).containsExactlyInAnyOrder("prod_1", "prod_2");
        assertThat(updatedDrinks.getProductIds()).isEmpty();
    }

    @Test
    void attachProductsRejectsAnUnknownCategory() {
        Menu menu = menu(List.of(new Category("cat_burgers", "Burgers", List.of(), List.of())));
        when(menuRepository.findByMenuId("menu_1")).thenReturn(Optional.of(menu));
        when(productRepository.findByProductId("prod_1")).thenReturn(Optional.of(mockProduct("prod_1")));

        assertThatThrownBy(() -> menuService.attachProducts("menu_1", "cat_missing", List.of("prod_1")))
                .isInstanceOf(NoSuchElementException.class);
    }

    @Test
    void attachProductsRejectsAnUnknownProduct() {
        Menu menu = menu(List.of(new Category("cat_burgers", "Burgers", List.of(), List.of())));
        when(menuRepository.findByMenuId("menu_1")).thenReturn(Optional.of(menu));
        when(productRepository.findByProductId("prod_missing")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> menuService.attachProducts("menu_1", "cat_burgers", List.of("prod_missing")))
                .isInstanceOf(NoSuchElementException.class);
    }

    @Test
    void triggerPublishMarksMenuPublishingAndSendsAFullyResolvedPayload() {
        Category burgers = new Category("cat_burgers", "Burgers", List.of(), List.of("prod_1"));
        Menu menu = menu(List.of(burgers));
        when(menuRepository.findByMenuId("menu_1")).thenReturn(Optional.of(menu));
        when(currencyRepository.findById("cur_aed_001"))
                .thenReturn(Optional.of(new Currency("cur_aed_001", "AED", "UAE Dirham", 2, ReferenceStatus.ACTIVE)));
        when(productRepository.findByProductId("prod_1")).thenReturn(Optional.of(mockProduct("prod_1")));
        when(taxRepository.findById("tax_vat_ae_001")).thenReturn(Optional.of(
                new Tax("tax_vat_ae_001", "UAE VAT", new BigDecimal("5.00"), "cty_ae_001", ReferenceStatus.ACTIVE, 1)));

        Menu result = menuService.triggerPublish("menu_1");

        assertThat(result.getStatus()).isEqualTo(MenuStatus.PUBLISHING);
        ArgumentCaptor<PublishRequestDto> captor = ArgumentCaptor.forClass(PublishRequestDto.class);
        org.mockito.Mockito.verify(publishingServiceClient).triggerPublish(captor.capture());
        PublishRequestDto payload = captor.getValue();
        assertThat(payload.menuId()).isEqualTo("menu_1");
        assertThat(payload.currencyPrecision()).isEqualTo(2);
        assertThat(payload.categories()).hasSize(1);
        assertThat(payload.categories().get(0).products()).hasSize(1);
        assertThat(payload.taxes()).extracting("taxId").contains("tax_vat_ae_001");
    }

    @Test
    void handlePublishResultAppliesPublishedStatus() {
        Menu menu = menu(List.of());
        when(menuRepository.findByMenuId("menu_1")).thenReturn(Optional.of(menu));

        menuService.handlePublishResult("menu_1", new PublishResultCallbackDto("PUBLISHED", null));

        ArgumentCaptor<Menu> captor = ArgumentCaptor.forClass(Menu.class);
        org.mockito.Mockito.verify(menuRepository).save(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(MenuStatus.PUBLISHED);
        assertThat(captor.getValue().getPublishedAt()).isNotNull();
    }

    @Test
    void handlePublishResultAppliesValidationFailedStatus() {
        Menu menu = menu(List.of());
        when(menuRepository.findByMenuId("menu_1")).thenReturn(Optional.of(menu));

        menuService.handlePublishResult("menu_1", new PublishResultCallbackDto("VALIDATION_FAILED", List.of("bad data")));

        ArgumentCaptor<Menu> captor = ArgumentCaptor.forClass(Menu.class);
        org.mockito.Mockito.verify(menuRepository).save(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(MenuStatus.VALIDATION_FAILED);
    }

    private Menu menu(List<Category> categories) {
        return new Menu("menu_1", "partner-1", "Summer Menu", "cty_ae_001", "cur_aed_001", List.of(), true,
                categories, MenuStatus.DRAFT, 1, Instant.now(), null);
    }

    private Product mockProduct(String productId) {
        return new Product(productId, "ext_" + productId, "SKU-1", "Cheeseburger",
                List.of(new ProductPrice("cur_aed_001", 1300, false, List.of("tax_vat_ae_001"))),
                ProductStatus.ACTIVE, 1, Instant.now(), Instant.now());
    }
}
