package com.example.menu.service.refdata;

import com.example.menu.domain.ReferenceStatus;
import com.example.menu.domain.Tax;
import com.example.menu.repository.TaxRepository;
import com.example.menu.service.IdGenerator;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;
import org.springframework.stereotype.Service;

@Service
public class TaxService {

    /**
     * Every percentage is normalized to this scale before it's stored or
     * queried on, so an equality lookup (used by bulk-import-service's
     * find-or-create resolve step) can never miss a match purely because
     * of a cosmetic scale difference (5.0 vs 5.00) in how MongoDB's
     * Decimal128 happens to represent the two values.
     */
    private static final int PERCENTAGE_SCALE = 2;

    private final TaxRepository repository;
    private final IdGenerator idGenerator;

    public TaxService(TaxRepository repository, IdGenerator idGenerator) {
        this.repository = repository;
        this.idGenerator = idGenerator;
    }

    public Tax create(String name, BigDecimal percentage, String countryId) {
        Tax tax = new Tax(idGenerator.generate("tax"), name, normalize(percentage), countryId, ReferenceStatus.ACTIVE, 1);
        return repository.save(tax);
    }

    public List<Tax> findAll() {
        return repository.findAll();
    }

    public Tax get(String id) {
        return repository.findById(id).orElseThrow(() -> new NoSuchElementException("no tax with id=" + id));
    }

    public Optional<Tax> findByNameAndPercentage(String name, BigDecimal percentage) {
        return repository.findByNameAndPercentage(name, normalize(percentage));
    }

    public Tax update(String id, String name, BigDecimal percentage, String countryId) {
        Tax existing = get(id);
        return repository.save(existing.withUpdate(name, normalize(percentage), countryId, existing.getStatus()));
    }

    public void delete(String id) {
        Tax existing = get(id);
        repository.save(existing.withStatus(ReferenceStatus.INACTIVE));
    }

    private BigDecimal normalize(BigDecimal percentage) {
        return percentage.setScale(PERCENTAGE_SCALE, RoundingMode.HALF_UP);
    }
}
