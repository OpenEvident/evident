package com.example.menu.service.refdata;

import com.example.menu.domain.Country;
import com.example.menu.domain.ReferenceStatus;
import com.example.menu.repository.CountryRepository;
import com.example.menu.service.IdGenerator;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;
import org.springframework.stereotype.Service;

@Service
public class CountryService {

    private final CountryRepository repository;
    private final IdGenerator idGenerator;

    public CountryService(CountryRepository repository, IdGenerator idGenerator) {
        this.repository = repository;
        this.idGenerator = idGenerator;
    }

    public Country create(String code, String name, String defaultCurrencyId) {
        Country country = new Country(idGenerator.generate("cty"), code, name, defaultCurrencyId, ReferenceStatus.ACTIVE);
        return repository.save(country);
    }

    public List<Country> findAll() {
        return repository.findAll();
    }

    public Country get(String id) {
        return repository.findById(id).orElseThrow(() -> new NoSuchElementException("no country with id=" + id));
    }

    public Optional<Country> findByCode(String code) {
        return repository.findByCode(code);
    }

    public Country update(String id, String name, String defaultCurrencyId) {
        Country existing = get(id);
        return repository.save(existing.withUpdate(name, defaultCurrencyId, existing.getStatus()));
    }

    /** Soft delete — matches the real system's tax soft-delete precedent, applied consistently across reference data. */
    public void delete(String id) {
        Country existing = get(id);
        repository.save(existing.withStatus(ReferenceStatus.INACTIVE));
    }
}
