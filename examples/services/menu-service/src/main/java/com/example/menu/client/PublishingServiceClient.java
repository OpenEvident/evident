package com.example.menu.client;

import com.example.menu.client.dto.PublishRequestDto;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
public class PublishingServiceClient {

    private final RestClient restClient;

    public PublishingServiceClient(
            RestClient.Builder restClientBuilder,
            @Value("${publishing-service.base-url}") String baseUrl
    ) {
        /* Pinned to the classic HttpURLConnection-based factory — see
         * MenuServiceClient in bulk-import-service for why. */
        this.restClient = restClientBuilder
                .baseUrl(baseUrl)
                .requestFactory(new SimpleClientHttpRequestFactory())
                .build();
    }

    public void triggerPublish(PublishRequestDto request) {
        try {
            restClient.post()
                    .uri("/publish")
                    .body(request)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException e) {
            throw new PublishingServiceClientException("failed to trigger publish for menuId=" + request.menuId(), e);
        }
    }
}
