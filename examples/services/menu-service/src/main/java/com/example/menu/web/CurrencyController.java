package com.example.menu.web;

import com.example.menu.service.refdata.CurrencyService;
import com.example.menu.web.dto.CurrencyRequestDto;
import com.example.menu.web.dto.CurrencyResponseDto;
import jakarta.validation.Valid;
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
public class CurrencyController {

    private final CurrencyService currencyService;

    public CurrencyController(CurrencyService currencyService) {
        this.currencyService = currencyService;
    }

    @PostMapping("/currencies")
    public ResponseEntity<CurrencyResponseDto> create(@Valid @RequestBody CurrencyRequestDto request) {
        var created = currencyService.create(request.code(), request.name(), request.precision());
        return ResponseEntity.status(HttpStatus.CREATED).body(CurrencyResponseDto.from(created));
    }

    /** Also serves as the lookup bulk-import-service's Sync workflow uses to resolve a raw currency code. */
    @GetMapping("/currencies")
    public List<CurrencyResponseDto> list(@RequestParam(required = false) String code) {
        if (code != null) {
            return currencyService.findByCode(code).map(CurrencyResponseDto::from).map(List::of).orElseGet(List::of);
        }
        return currencyService.findAll().stream().map(CurrencyResponseDto::from).toList();
    }

    @GetMapping("/currencies/{id}")
    public CurrencyResponseDto get(@PathVariable String id) {
        return CurrencyResponseDto.from(currencyService.get(id));
    }

    @PutMapping("/currencies/{id}")
    public CurrencyResponseDto update(@PathVariable String id, @Valid @RequestBody CurrencyRequestDto request) {
        return CurrencyResponseDto.from(currencyService.update(id, request.name(), request.precision()));
    }

    @DeleteMapping("/currencies/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        currencyService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
