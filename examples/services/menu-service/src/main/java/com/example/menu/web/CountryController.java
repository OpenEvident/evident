package com.example.menu.web;

import com.example.menu.service.refdata.CountryService;
import com.example.menu.web.dto.CountryRequestDto;
import com.example.menu.web.dto.CountryResponseDto;
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
import org.springframework.web.bind.annotation.RestController;

@RestController
public class CountryController {

    private final CountryService countryService;

    public CountryController(CountryService countryService) {
        this.countryService = countryService;
    }

    @PostMapping("/countries")
    public ResponseEntity<CountryResponseDto> create(@Valid @RequestBody CountryRequestDto request) {
        var created = countryService.create(request.code(), request.name(), request.defaultCurrencyId());
        return ResponseEntity.status(HttpStatus.CREATED).body(CountryResponseDto.from(created));
    }

    @GetMapping("/countries")
    public List<CountryResponseDto> list() {
        return countryService.findAll().stream().map(CountryResponseDto::from).toList();
    }

    @GetMapping("/countries/{id}")
    public CountryResponseDto get(@PathVariable String id) {
        return CountryResponseDto.from(countryService.get(id));
    }

    @PutMapping("/countries/{id}")
    public CountryResponseDto update(@PathVariable String id, @Valid @RequestBody CountryRequestDto request) {
        return CountryResponseDto.from(countryService.update(id, request.name(), request.defaultCurrencyId()));
    }

    @DeleteMapping("/countries/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        countryService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
