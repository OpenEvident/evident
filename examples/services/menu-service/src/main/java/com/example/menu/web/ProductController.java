package com.example.menu.web;

import com.example.menu.domain.Product;
import com.example.menu.domain.ProductPrice;
import com.example.menu.domain.ProductStatus;
import com.example.menu.service.ProductBulkOrchestrator;
import com.example.menu.service.ProductService;
import com.example.menu.web.dto.BulkProductRequestDto;
import com.example.menu.web.dto.BulkProductResponseDto;
import com.example.menu.web.dto.BulkStatusResponseDto;
import com.example.menu.web.dto.ProductPriceDto;
import com.example.menu.web.dto.ProductRequestDto;
import com.example.menu.web.dto.ProductResponseDto;
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
public class ProductController {

    private final ProductService productService;
    private final ProductBulkOrchestrator bulkOrchestrator;

    public ProductController(ProductService productService, ProductBulkOrchestrator bulkOrchestrator) {
        this.productService = productService;
        this.bulkOrchestrator = bulkOrchestrator;
    }

    @PostMapping("/products/bulk")
    public ResponseEntity<BulkProductResponseDto> bulk(@Valid @RequestBody BulkProductRequestDto request) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(bulkOrchestrator.startBulk(request));
    }

    @GetMapping("/bulk/{batchId}/status")
    public BulkStatusResponseDto bulkStatus(@PathVariable String batchId) {
        return bulkOrchestrator.getStatus(batchId);
    }

    @PostMapping("/products")
    public ResponseEntity<ProductResponseDto> create(@Valid @RequestBody ProductRequestDto request) {
        Product created = productService.create(request.sku(), request.name(), toDomainPrices(request.prices()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ProductResponseDto.from(created));
    }

    @GetMapping("/products")
    public List<ProductResponseDto> list(@RequestParam(required = false) ProductStatus status) {
        return productService.findAll(status).stream().map(ProductResponseDto::from).toList();
    }

    @GetMapping("/products/{productId}")
    public ProductResponseDto get(@PathVariable String productId) {
        return ProductResponseDto.from(productService.get(productId));
    }

    @PutMapping("/products/{productId}")
    public ProductResponseDto update(@PathVariable String productId, @Valid @RequestBody ProductRequestDto request) {
        Product updated = productService.update(productId, request.sku(), request.name(), toDomainPrices(request.prices()));
        return ProductResponseDto.from(updated);
    }

    @DeleteMapping("/products/{productId}")
    public ResponseEntity<Void> delete(@PathVariable String productId) {
        productService.delete(productId);
        return ResponseEntity.noContent().build();
    }

    private List<ProductPrice> toDomainPrices(List<ProductPriceDto> dtos) {
        return dtos.stream()
                .map(dto -> new ProductPrice(dto.currencyId(), dto.amount(), dto.taxInclusive(), dto.taxIds()))
                .toList();
    }
}
