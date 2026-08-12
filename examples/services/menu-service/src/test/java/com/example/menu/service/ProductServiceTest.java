package com.example.menu.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.menu.domain.Menu;
import com.example.menu.domain.MenuStatus;
import com.example.menu.domain.Product;
import com.example.menu.domain.ProductPrice;
import com.example.menu.domain.ProductStatus;
import com.example.menu.repository.MenuRepository;
import com.example.menu.repository.ProductRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ProductServiceTest {

    @Mock
    private ProductRepository productRepository;
    @Mock
    private MenuRepository menuRepository;

    private ProductService productService;

    @BeforeEach
    void setUp() {
        productService = new ProductService(productRepository, menuRepository, new IdGenerator());
        org.mockito.Mockito.lenient().when(productRepository.save(any(Product.class))).thenAnswer(inv -> inv.getArgument(0));
        org.mockito.Mockito.lenient().when(menuRepository.save(any(Menu.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void createFromBulkAssignsANewProductId() {
        Product created = productService.createFromBulk(
                "pos-sku-0001", "SKU-1", "Cheeseburger",
                List.of(new ProductPrice("cur_aed_001", 1300, false, List.of("tax_vat_ae_001"))));

        assertThat(created.getProductId()).isNotBlank();
        assertThat(created.getExternalId()).isEqualTo("pos-sku-0001");
        assertThat(created.getVersion()).isEqualTo(1);
    }

    @Test
    void updateFromBulkOnlyFlagsPublishedMenusAsStale() {
        Product existing = new Product("prod_1", "pos-sku-0001", "SKU-1", "Old Name",
                List.of(), ProductStatus.ACTIVE, 1, Instant.now(), Instant.now());
        when(productRepository.findByExternalId("pos-sku-0001")).thenReturn(Optional.of(existing));

        Menu published = menu("menu_published", MenuStatus.PUBLISHED);
        Menu draft = menu("menu_draft", MenuStatus.DRAFT);
        when(menuRepository.findByCategoriesProductIdsContaining("prod_1")).thenReturn(List.of(published, draft));

        productService.updateFromBulk("pos-sku-0001", "SKU-1", "New Name", List.of());

        verify(menuRepository, times(1)).save(any(Menu.class));
    }

    @Test
    void updateFromBulkDoesNothingWhenNoMenuReferencesTheProduct() {
        Product existing = new Product("prod_1", "pos-sku-0001", "SKU-1", "Old Name",
                List.of(), ProductStatus.ACTIVE, 1, Instant.now(), Instant.now());
        when(productRepository.findByExternalId("pos-sku-0001")).thenReturn(Optional.of(existing));
        when(menuRepository.findByCategoriesProductIdsContaining("prod_1")).thenReturn(List.of());

        productService.updateFromBulk("pos-sku-0001", "SKU-1", "New Name", List.of());

        verify(menuRepository, never()).save(any(Menu.class));
    }

    private Menu menu(String menuId, MenuStatus status) {
        return new Menu(menuId, "partner-1", "Menu", "cty_ae_001", "cur_aed_001", List.of(), false, List.of(),
                status, 1, Instant.now(), null);
    }
}
