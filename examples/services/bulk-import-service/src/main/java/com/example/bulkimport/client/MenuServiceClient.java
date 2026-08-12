package com.example.bulkimport.client;

import com.example.bulkimport.client.dto.BulkProductRequestDto;
import com.example.bulkimport.client.dto.BulkProductResponseDto;
import com.example.bulkimport.client.dto.CurrencyDto;
import com.example.bulkimport.client.dto.TaxCreateRequestDto;
import com.example.bulkimport.client.dto.TaxDto;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Outbound calls to menu-service — reference-data lookups for the Sync
 * workflow's {@code RESOLVING_REFS} step, and the batched product dispatch
 * for {@code DISPATCHING}.
 */
@Component
public class MenuServiceClient {

    private final RestClient restClient;

    public MenuServiceClient(RestClient.Builder restClientBuilder, @Value("${menu-service.base-url}") String baseUrl) {
        /* Pinned to the classic HttpURLConnection-based factory rather than
         * Spring's default detection, which can select the JDK's
         * java.net.http.HttpClient — that client fails outright on some
         * Windows dev machines (loopback selector pipe blocked by local
         * security software) even for plain outbound HTTP calls. */
        this.restClient = restClientBuilder
                .baseUrl(baseUrl)
                .requestFactory(new SimpleClientHttpRequestFactory())
                .build();
    }

    public Optional<CurrencyDto> findCurrencyByCode(String code) {
        try {
            List<CurrencyDto> results = restClient.get()
                    .uri(uriBuilder -> uriBuilder.path("/currencies").queryParam("code", code).build())
                    .retrieve()
                    .body(new org.springframework.core.ParameterizedTypeReference<List<CurrencyDto>>() {
                    });
            return results == null || results.isEmpty() ? Optional.empty() : Optional.of(results.get(0));
        } catch (RestClientException e) {
            throw new MenuServiceClientException("failed to look up currency code=" + code, e);
        }
    }

    public Optional<TaxDto> findTax(String name, BigDecimal percentage) {
        try {
            List<TaxDto> results = restClient.get()
                    .uri(uriBuilder -> uriBuilder.path("/taxes")
                            .queryParam("name", name)
                            .queryParam("percentage", percentage.toPlainString())
                            .build())
                    .retrieve()
                    .body(new org.springframework.core.ParameterizedTypeReference<List<TaxDto>>() {
                    });
            return results == null || results.isEmpty() ? Optional.empty() : Optional.of(results.get(0));
        } catch (RestClientException e) {
            throw new MenuServiceClientException("failed to look up tax name=" + name + " percentage=" + percentage, e);
        }
    }

    public TaxDto createTax(String name, BigDecimal percentage) {
        try {
            TaxDto created = restClient.post()
                    .uri("/taxes")
                    .body(new TaxCreateRequestDto(name, percentage))
                    .retrieve()
                    .body(TaxDto.class);
            if (created == null) {
                throw new MenuServiceClientException("menu-service returned an empty body for tax creation");
            }
            return created;
        } catch (RestClientException e) {
            throw new MenuServiceClientException("failed to create tax name=" + name + " percentage=" + percentage, e);
        }
    }

    public BulkProductResponseDto dispatchProductsBulk(BulkProductRequestDto request) {
        try {
            BulkProductResponseDto response = restClient.post()
                    .uri("/products/bulk")
                    .body(request)
                    .retrieve()
                    .body(BulkProductResponseDto.class);
            if (response == null) {
                throw new MenuServiceClientException("menu-service returned an empty body for bulk product dispatch");
            }
            return response;
        } catch (RestClientException e) {
            throw new MenuServiceClientException("failed to dispatch bulk products to menu-service", e);
        }
    }
}
