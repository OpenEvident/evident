package com.example.bulkimport.repository;

import com.example.bulkimport.domain.ImportedProduct;
import com.example.bulkimport.domain.SelectionStatus;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface ImportedProductRepository extends MongoRepository<ImportedProduct, String> {

    Optional<ImportedProduct> findByPartnerIdAndExternalId(String partnerId, String externalId);

    List<ImportedProduct> findByPartnerIdAndExternalIdIn(String partnerId, Collection<String> externalIds);

    List<ImportedProduct> findByPartnerIdAndSelectionStatus(String partnerId, SelectionStatus selectionStatus);

    List<ImportedProduct> findByPartnerId(String partnerId);
}
