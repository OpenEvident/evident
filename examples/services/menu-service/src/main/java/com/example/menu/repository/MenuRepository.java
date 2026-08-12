package com.example.menu.repository;

import com.example.menu.domain.Menu;
import com.example.menu.domain.MenuStatus;
import java.util.List;
import java.util.Optional;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;

public interface MenuRepository extends MongoRepository<Menu, String> {

    Optional<Menu> findByMenuId(String menuId);

    List<Menu> findByPartnerId(String partnerId);

    List<Menu> findByPartnerIdAndStatus(String partnerId, MenuStatus status);

    @Query("{ 'categories.productIds': ?0 }")
    List<Menu> findByCategoriesProductIdsContaining(String productId);
}
