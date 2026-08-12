package com.example.bulkimport.web;

import com.example.bulkimport.domain.ImportedProduct;
import com.example.bulkimport.domain.SelectionStatus;
import com.example.bulkimport.repository.ImportRequestRepository;
import com.example.bulkimport.repository.ImportedProductRepository;
import com.example.bulkimport.service.ImportService;
import com.example.bulkimport.web.dto.ImportRequestAuditDto;
import com.example.bulkimport.web.dto.ImportRequestDto;
import com.example.bulkimport.web.dto.ImportResponseDto;
import com.example.bulkimport.web.dto.ImportedProductDto;
import jakarta.validation.Valid;
import java.util.List;
import java.util.NoSuchElementException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ImportController {

    private final ImportService importService;
    private final ImportedProductRepository importedProductRepository;
    private final ImportRequestRepository importRequestRepository;

    public ImportController(
            ImportService importService,
            ImportedProductRepository importedProductRepository,
            ImportRequestRepository importRequestRepository
    ) {
        this.importService = importService;
        this.importedProductRepository = importedProductRepository;
        this.importRequestRepository = importRequestRepository;
    }

    @PostMapping("/imports")
    public ResponseEntity<ImportResponseDto> importProducts(@Valid @RequestBody ImportRequestDto request) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(importService.processImport(request));
    }

    @GetMapping("/imports/products")
    public List<ImportedProductDto> listImportedProducts(
            @RequestParam String partnerId,
            @RequestParam(required = false) SelectionStatus selectionStatus
    ) {
        List<ImportedProduct> products = selectionStatus == null
                ? importedProductRepository.findByPartnerId(partnerId)
                : importedProductRepository.findByPartnerIdAndSelectionStatus(partnerId, selectionStatus);
        return products.stream().map(ImportedProductDto::from).toList();
    }

    @GetMapping("/imports/products/{externalId}")
    public ImportedProductDto getImportedProduct(@RequestParam String partnerId, @PathVariable String externalId) {
        return importedProductRepository.findByPartnerIdAndExternalId(partnerId, externalId)
                .map(ImportedProductDto::from)
                .orElseThrow(() -> new NoSuchElementException(
                        "no imported product for partnerId=" + partnerId + " externalId=" + externalId));
    }

    @GetMapping("/imports/requests/{requestId}")
    public ImportRequestAuditDto getImportRequest(@PathVariable String requestId) {
        return importRequestRepository.findByRequestId(requestId)
                .map(ImportRequestAuditDto::from)
                .orElseThrow(() -> new NoSuchElementException("no import request with requestId=" + requestId));
    }
}
