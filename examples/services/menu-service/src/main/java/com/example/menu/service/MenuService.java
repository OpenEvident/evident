package com.example.menu.service;

import com.example.menu.client.PublishingServiceClient;
import com.example.menu.client.dto.PublishCategoryDto;
import com.example.menu.client.dto.PublishPriceDto;
import com.example.menu.client.dto.PublishProductDto;
import com.example.menu.client.dto.PublishRequestDto;
import com.example.menu.client.dto.PublishTaxDto;
import com.example.menu.domain.Category;
import com.example.menu.domain.Currency;
import com.example.menu.domain.Menu;
import com.example.menu.domain.MenuStatus;
import com.example.menu.domain.Product;
import com.example.menu.domain.Tax;
import com.example.menu.logging.StructuredLog;
import com.example.menu.repository.CurrencyRepository;
import com.example.menu.repository.MenuRepository;
import com.example.menu.repository.ProductRepository;
import com.example.menu.repository.TaxRepository;
import com.example.menu.web.dto.CategoryRequestDto;
import com.example.menu.web.dto.PublishResultCallbackDto;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Menu CRUD, manual category-assembly (attach existing products — the
 * actual, deliberate, never-automatic menu-assembly action), and the
 * explicit publish trigger — never auto-fired.
 */
@Service
public class MenuService {

    private static final Logger log = LoggerFactory.getLogger(MenuService.class);

    private final MenuRepository menuRepository;
    private final ProductRepository productRepository;
    private final CurrencyRepository currencyRepository;
    private final TaxRepository taxRepository;
    private final PublishingServiceClient publishingServiceClient;
    private final IdGenerator idGenerator;

    public MenuService(
            MenuRepository menuRepository,
            ProductRepository productRepository,
            CurrencyRepository currencyRepository,
            TaxRepository taxRepository,
            PublishingServiceClient publishingServiceClient,
            IdGenerator idGenerator
    ) {
        this.menuRepository = menuRepository;
        this.productRepository = productRepository;
        this.currencyRepository = currencyRepository;
        this.taxRepository = taxRepository;
        this.publishingServiceClient = publishingServiceClient;
        this.idGenerator = idGenerator;
    }

    public Menu create(
            String partnerId, String name, String countryId, String currencyId, List<String> taxIds,
            boolean applyMenuLevelTax, List<CategoryRequestDto> categoryRequests
    ) {
        List<Category> categories = categoryRequests.stream()
                .map(c -> new Category(idGenerator.generate("cat"), c.name(), c.taxIds(), List.of()))
                .toList();
        Menu menu = new Menu(
                idGenerator.generate("menu"), partnerId, name, countryId, currencyId, taxIds, applyMenuLevelTax,
                categories, MenuStatus.DRAFT, 1, Instant.now(), null);
        return menuRepository.save(menu);
    }

    public Menu get(String menuId) {
        return menuRepository.findByMenuId(menuId)
                .orElseThrow(() -> new NoSuchElementException("no menu with menuId=" + menuId));
    }

    public List<Menu> findAll(String partnerId, MenuStatus status) {
        if (partnerId == null) {
            return menuRepository.findAll();
        }
        return status == null ? menuRepository.findByPartnerId(partnerId) : menuRepository.findByPartnerIdAndStatus(partnerId, status);
    }

    public Menu update(
            String menuId, String name, String countryId, String currencyId, List<String> taxIds, boolean applyMenuLevelTax
    ) {
        Menu existing = get(menuId);
        return menuRepository.save(existing.withUpdate(name, countryId, currencyId, taxIds, applyMenuLevelTax));
    }

    public void delete(String menuId) {
        Menu existing = get(menuId);
        menuRepository.deleteById(existing.getId());
    }

    /** The manual, deliberate menu-assembly action — never triggered automatically by a sync. */
    public Menu attachProducts(String menuId, String categoryId, List<String> productIds) {
        Menu menu = get(menuId);
        for (String productId : productIds) {
            productRepository.findByProductId(productId)
                    .orElseThrow(() -> new NoSuchElementException("no product with productId=" + productId));
        }

        List<Category> updatedCategories = menu.getCategories().stream()
                .map(c -> c.getCategoryId().equals(categoryId) ? c.withAddedProducts(productIds) : c)
                .toList();
        boolean categoryFound = menu.getCategories().stream().anyMatch(c -> c.getCategoryId().equals(categoryId));
        if (!categoryFound) {
            throw new NoSuchElementException("no category with categoryId=" + categoryId + " on menu " + menuId);
        }

        Menu saved = menuRepository.save(menu.withCategories(updatedCategories));
        StructuredLog.fields()
                .with("menuId", menuId)
                .with("categoryId", categoryId)
                .with("productIds", String.join(",", productIds))
                .with("event", "menu.products_attached")
                .info(log, "attached " + productIds.size() + " product(s) to " + menuId + "/" + categoryId);
        return saved;
    }

    /** The explicit, separately-triggered publish action — resolves the full payload and hands it to publishing-service. */
    public Menu triggerPublish(String menuId) {
        Menu menu = get(menuId);
        Menu publishing = menuRepository.save(menu.withStatus(MenuStatus.PUBLISHING));

        StructuredLog.fields()
                .with("menuId", menuId)
                .with("event", "menu.publish.triggered")
                .info(log, "publish triggered for " + menuId);

        PublishRequestDto payload = buildPublishPayload(publishing);
        publishingServiceClient.triggerPublish(payload);
        return publishing;
    }

    public void handlePublishResult(String menuId, PublishResultCallbackDto callback) {
        Menu menu = get(menuId);
        if ("PUBLISHED".equals(callback.status())) {
            menuRepository.save(menu.withPublished(Instant.now()));
        } else {
            menuRepository.save(menu.withStatus(MenuStatus.VALIDATION_FAILED));
        }
    }

    private PublishRequestDto buildPublishPayload(Menu menu) {
        Currency currency = currencyRepository.findById(menu.getCurrencyId())
                .orElseThrow(() -> new NoSuchElementException("no currency with id=" + menu.getCurrencyId()));

        Set<String> allTaxIds = new LinkedHashSet<>(menu.getTaxIds());
        List<PublishCategoryDto> categories = new ArrayList<>();
        for (Category category : menu.getCategories()) {
            allTaxIds.addAll(category.getTaxIds());
            List<PublishProductDto> products = new ArrayList<>();
            for (String productId : category.getProductIds()) {
                Product product = productRepository.findByProductId(productId)
                        .orElseThrow(() -> new NoSuchElementException("no product with productId=" + productId));
                List<PublishPriceDto> prices = product.getPrices().stream()
                        .map(p -> {
                            allTaxIds.addAll(p.taxIds());
                            return new PublishPriceDto(p.currencyId(), p.amount(), p.taxInclusive(), p.taxIds());
                        })
                        .toList();
                products.add(new PublishProductDto(product.getProductId(), product.getSku(), product.getName(), prices));
            }
            categories.add(new PublishCategoryDto(category.getCategoryId(), category.getName(), category.getTaxIds(), products));
        }

        List<PublishTaxDto> taxes = allTaxIds.stream()
                .map(taxId -> taxRepository.findById(taxId).orElse(null))
                .filter(t -> t != null)
                .map(this::toPublishTaxDto)
                .toList();

        return new PublishRequestDto(
                menu.getMenuId(), menu.getName(), menu.getCountryId(), menu.getCurrencyId(), currency.getPrecision(),
                menu.getTaxIds(), menu.isApplyMenuLevelTax(), categories, taxes);
    }

    private PublishTaxDto toPublishTaxDto(Tax tax) {
        return new PublishTaxDto(tax.getId(), tax.getName(), tax.getPercentage(), tax.getCountryId(), tax.getStatus().name());
    }
}
