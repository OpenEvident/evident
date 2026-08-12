package com.example.menu.repository;

import com.example.menu.domain.Tax;
import java.math.BigDecimal;
import java.util.Optional;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface TaxRepository extends MongoRepository<Tax, String> {

    Optional<Tax> findByNameAndPercentage(String name, BigDecimal percentage);
}
