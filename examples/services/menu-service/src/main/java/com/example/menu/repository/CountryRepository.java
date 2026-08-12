package com.example.menu.repository;

import com.example.menu.domain.Country;
import java.util.List;
import java.util.Optional;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface CountryRepository extends MongoRepository<Country, String> {

    Optional<Country> findByCode(String code);

    List<Country> findByCodeIn(List<String> codes);
}
