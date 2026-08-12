package com.example.bulkimport.repository;

import com.example.bulkimport.domain.SyncedProduct;
import java.util.Optional;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface SyncedProductRepository extends MongoRepository<SyncedProduct, String> {

    Optional<SyncedProduct> findByPartnerIdAndExternalId(String partnerId, String externalId);
}
