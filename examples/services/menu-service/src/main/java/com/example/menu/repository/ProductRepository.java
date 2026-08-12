package com.example.menu.repository;

import com.example.menu.domain.Product;
import com.example.menu.domain.ProductStatus;
import java.util.List;
import java.util.Optional;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface ProductRepository extends MongoRepository<Product, String> {

    Optional<Product> findByProductId(String productId);

    Optional<Product> findByExternalId(String externalId);

    List<Product> findByStatus(ProductStatus status);
}
