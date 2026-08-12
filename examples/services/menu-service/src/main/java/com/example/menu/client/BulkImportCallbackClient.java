package com.example.menu.client;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * The per-item callback back to bulk-import-service —
 * {@code POST /imports/products/{externalId}/sync-result} — fired once per
 * bulk product item, success or failure, since bulk-import-service's own
 * Sync workflow treats the callback (not a poll) as authoritative.
 */
@Component
public class BulkImportCallbackClient {

    private final RestClient restClient;

    public BulkImportCallbackClient(
            RestClient.Builder restClientBuilder,
            @Value("${bulk-import-service.base-url}") String baseUrl
    ) {
        /* Pinned to the classic HttpURLConnection-based factory — see
         * MenuServiceClient in bulk-import-service for why: Spring's
         * default detection can select the JDK's java.net.http.HttpClient,
         * which fails outright on some Windows dev machines. */
        this.restClient = restClientBuilder
                .baseUrl(baseUrl)
                .requestFactory(new SimpleClientHttpRequestFactory())
                .build();
    }

    public void sendSyncResult(String externalId, String syncId, String productId, String status) {
        try {
            restClient.post()
                    .uri("/imports/products/{externalId}/sync-result", externalId)
                    .body(new SyncResultCallbackDto(syncId, productId, status))
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException e) {
            throw new BulkImportCallbackException("failed to deliver sync-result callback for " + externalId, e);
        }
    }

    private record SyncResultCallbackDto(String syncId, String productId, String status) {
    }
}
