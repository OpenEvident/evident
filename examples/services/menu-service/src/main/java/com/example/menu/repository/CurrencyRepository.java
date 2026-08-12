package com.example.menu.repository;

import com.example.menu.domain.Currency;
import java.util.Optional;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface CurrencyRepository extends MongoRepository<Currency, String> {

    Optional<Currency> findByCode(String code);
}
