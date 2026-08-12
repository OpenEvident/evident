package com.example.menu.web;

import com.example.menu.service.refdata.TaxService;
import com.example.menu.web.dto.TaxRequestDto;
import com.example.menu.web.dto.TaxResponseDto;
import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TaxController {

    private final TaxService taxService;

    public TaxController(TaxService taxService) {
        this.taxService = taxService;
    }

    @PostMapping("/taxes")
    public ResponseEntity<TaxResponseDto> create(@Valid @RequestBody TaxRequestDto request) {
        var created = taxService.create(request.name(), request.percentage(), request.countryId());
        return ResponseEntity.status(HttpStatus.CREATED).body(TaxResponseDto.from(created));
    }

    /** Also serves as the find half of bulk-import-service's Sync workflow's find-or-create tax resolution. */
    @GetMapping("/taxes")
    public List<TaxResponseDto> list(
            @RequestParam(required = false) String name,
            @RequestParam(required = false) BigDecimal percentage
    ) {
        if (name != null && percentage != null) {
            return taxService.findByNameAndPercentage(name, percentage).map(TaxResponseDto::from).map(List::of).orElseGet(List::of);
        }
        return taxService.findAll().stream().map(TaxResponseDto::from).toList();
    }

    @GetMapping("/taxes/{id}")
    public TaxResponseDto get(@PathVariable String id) {
        return TaxResponseDto.from(taxService.get(id));
    }

    @PutMapping("/taxes/{id}")
    public TaxResponseDto update(@PathVariable String id, @Valid @RequestBody TaxRequestDto request) {
        return TaxResponseDto.from(taxService.update(id, request.name(), request.percentage(), request.countryId()));
    }

    @DeleteMapping("/taxes/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        taxService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
