package com.example.menu.domain;

import java.time.Instant;
import java.util.List;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

@Document("menus")
public class Menu {

    @Id
    private String id;
    @Indexed(unique = true)
    private String menuId;
    private String partnerId;
    private String name;
    private String countryId;
    private String currencyId;
    private List<String> taxIds;
    private boolean applyMenuLevelTax;
    private List<Category> categories;
    private MenuStatus status;
    private long version;
    private Instant createdAt;
    private Instant publishedAt;

    protected Menu() {
    }

    public Menu(
            String menuId,
            String partnerId,
            String name,
            String countryId,
            String currencyId,
            List<String> taxIds,
            boolean applyMenuLevelTax,
            List<Category> categories,
            MenuStatus status,
            long version,
            Instant createdAt,
            Instant publishedAt
    ) {
        this.menuId = menuId;
        this.partnerId = partnerId;
        this.name = name;
        this.countryId = countryId;
        this.currencyId = currencyId;
        this.taxIds = taxIds;
        this.applyMenuLevelTax = applyMenuLevelTax;
        this.categories = categories;
        this.status = status;
        this.version = version;
        this.createdAt = createdAt;
        this.publishedAt = publishedAt;
    }

    public String getId() {
        return id;
    }

    public String getMenuId() {
        return menuId;
    }

    public String getPartnerId() {
        return partnerId;
    }

    public String getName() {
        return name;
    }

    public String getCountryId() {
        return countryId;
    }

    public String getCurrencyId() {
        return currencyId;
    }

    public List<String> getTaxIds() {
        return taxIds;
    }

    public boolean isApplyMenuLevelTax() {
        return applyMenuLevelTax;
    }

    public List<Category> getCategories() {
        return categories;
    }

    public MenuStatus getStatus() {
        return status;
    }

    public long getVersion() {
        return version;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getPublishedAt() {
        return publishedAt;
    }

    private Menu copyWith(
            String name, String countryId, String currencyId, List<String> taxIds, boolean applyMenuLevelTax,
            List<Category> categories, MenuStatus status, Instant publishedAt
    ) {
        Menu updated = new Menu(
                this.menuId, this.partnerId, name, countryId, currencyId, taxIds, applyMenuLevelTax, categories,
                status, this.version + 1, this.createdAt, publishedAt);
        updated.id = this.id;
        return updated;
    }

    public Menu withUpdate(
            String name, String countryId, String currencyId, List<String> taxIds, boolean applyMenuLevelTax
    ) {
        return copyWith(name, countryId, currencyId, taxIds, applyMenuLevelTax, this.categories, this.status, this.publishedAt);
    }

    public Menu withCategories(List<Category> categories) {
        return copyWith(this.name, this.countryId, this.currencyId, this.taxIds, this.applyMenuLevelTax,
                categories, this.status, this.publishedAt);
    }

    public Menu withStatus(MenuStatus status) {
        return copyWith(this.name, this.countryId, this.currencyId, this.taxIds, this.applyMenuLevelTax,
                this.categories, status, this.publishedAt);
    }

    public Menu withPublished(Instant publishedAt) {
        return copyWith(this.name, this.countryId, this.currencyId, this.taxIds, this.applyMenuLevelTax,
                this.categories, MenuStatus.PUBLISHED, publishedAt);
    }
}
