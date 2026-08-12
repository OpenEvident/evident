package com.example.publishing.repository;

import com.example.publishing.domain.MaterializedView;
import java.util.Optional;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface MaterializedViewRepository extends MongoRepository<MaterializedView, String> {

    Optional<MaterializedView> findByMenuId(String menuId);
}
