package com.example.menu.service;

import com.example.menu.domain.Menu;
import com.example.menu.domain.MenuStatus;
import com.example.menu.domain.Product;
import com.example.menu.domain.ProductPrice;
import com.example.menu.domain.ProductStatus;
import com.example.menu.logging.StructuredLog;
import com.example.menu.repository.MenuRepository;
import com.example.menu.repository.ProductRepository;
import java.time.Instant;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Manual Product CRUD, plus the create/update paths used by the bulk
 * dispatch pipeline ({@link ProductBulkBatchProcessor}) and the
 * reverse-lookup cascade that flags a referencing, currently-PUBLISHED
 * menu {@code UPDATES_AVAILABLE} whenever a product it contains changes —
 * confirmed to apply on both UPDATE and DELETE (a delete is at least as
 * significant a change as an update).
 */
@Service
public class ProductService {

    private static final Logger log = LoggerFactory.getLogger(ProductService.class);

    private final ProductRepository productRepository;
    private final MenuRepository menuRepository;
    private final IdGenerator idGenerator;

    public ProductService(ProductRepository productRepository, MenuRepository menuRepository, IdGenerator idGenerator) {
        this.productRepository = productRepository;
        this.menuRepository = menuRepository;
        this.idGenerator = idGenerator;
    }

    public Product create(String sku, String name, List<ProductPrice> prices) {
        Instant now = Instant.now();
        Product product = new Product(
                idGenerator.generate("prod"), null, sku, name, prices, ProductStatus.ACTIVE, 1, now, now);
        return productRepository.save(product);
    }

    public Product get(String productId) {
        return productRepository.findByProductId(productId)
                .orElseThrow(() -> new NoSuchElementException("no product with productId=" + productId));
    }

    public List<Product> findAll(ProductStatus status) {
        return status == null ? productRepository.findAll() : productRepository.findByStatus(status);
    }

    public Product update(String productId, String sku, String name, List<ProductPrice> prices) {
        Product existing = get(productId);
        Product updated = productRepository.save(existing.withUpdate(sku, name, prices, Instant.now()));
        markReferencingPublishedMenusStale(productId);
        return updated;
    }

    public void delete(String productId) {
        Product existing = get(productId);
        productRepository.save(existing.withStatus(ProductStatus.INACTIVE, Instant.now()));
        markReferencingPublishedMenusStale(productId);
    }

    /** Used only by {@link ProductBulkBatchProcessor} — a bulk item's action already carries CREATE/UPDATE. */
    public Product createFromBulk(String externalId, String sku, String name, List<ProductPrice> prices) {
        Instant now = Instant.now();
        Product product = new Product(
                idGenerator.generate("prod"), externalId, sku, name, prices, ProductStatus.ACTIVE, 1, now, now);
        Product saved = productRepository.save(product);
        StructuredLog.fields()
                .with("productId", saved.getProductId())
                .with("externalId", externalId)
                .with("action", "CREATE")
                .with("event", "product.saved")
                .info(log, "created product " + saved.getProductId() + " from bulk item " + externalId);
        return saved;
    }

    public Product updateFromBulk(String externalId, String sku, String name, List<ProductPrice> prices) {
        Product existing = productRepository.findByExternalId(externalId)
                .orElseThrow(() -> new NoSuchElementException("no product with externalId=" + externalId + " to update"));
        Product saved = productRepository.save(existing.withUpdate(sku, name, prices, Instant.now()));
        StructuredLog.fields()
                .with("productId", saved.getProductId())
                .with("externalId", externalId)
                .with("action", "UPDATE")
                .with("event", "product.saved")
                .info(log, "updated product " + saved.getProductId() + " from bulk item " + externalId);
        markReferencingPublishedMenusStale(saved.getProductId());
        return saved;
    }

    public Optional<Product> findByExternalId(String externalId) {
        return productRepository.findByExternalId(externalId);
    }

    private void markReferencingPublishedMenusStale(String productId) {
        List<Menu> referencingMenus = menuRepository.findByCategoriesProductIdsContaining(productId);
        for (Menu menu : referencingMenus) {
            if (menu.getStatus() == MenuStatus.PUBLISHED) {
                menuRepository.save(menu.withStatus(MenuStatus.UPDATES_AVAILABLE));
                StructuredLog.fields()
                        .with("productId", productId)
                        .with("menuId", menu.getMenuId())
                        .with("event", "menu.updates_available")
                        .info(log, "menu " + menu.getMenuId() + " flagged stale by product " + productId);
            }
        }
    }
}
