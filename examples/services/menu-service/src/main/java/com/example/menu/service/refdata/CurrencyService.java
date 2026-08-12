package com.example.menu.service.refdata;

import com.example.menu.domain.Currency;
import com.example.menu.domain.ReferenceStatus;
import com.example.menu.repository.CurrencyRepository;
import com.example.menu.service.IdGenerator;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;
import org.springframework.stereotype.Service;

@Service
public class CurrencyService {

    private final CurrencyRepository repository;
    private final IdGenerator idGenerator;

    public CurrencyService(CurrencyRepository repository, IdGenerator idGenerator) {
        this.repository = repository;
        this.idGenerator = idGenerator;
    }

    public Currency create(String code, String name, int precision) {
        Currency currency = new Currency(idGenerator.generate("cur"), code, name, precision, ReferenceStatus.ACTIVE);
        return repository.save(currency);
    }

    public List<Currency> findAll() {
        return repository.findAll();
    }

    public Currency get(String id) {
        return repository.findById(id).orElseThrow(() -> new NoSuchElementException("no currency with id=" + id));
    }

    public Optional<Currency> findByCode(String code) {
        return repository.findByCode(code);
    }

    public Currency update(String id, String name, int precision) {
        Currency existing = get(id);
        return repository.save(existing.withUpdate(name, precision, existing.getStatus()));
    }

    public void delete(String id) {
        Currency existing = get(id);
        repository.save(existing.withStatus(ReferenceStatus.INACTIVE));
    }
}
