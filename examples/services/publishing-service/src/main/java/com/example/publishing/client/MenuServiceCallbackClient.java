package com.example.publishing.client;

import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * The publish-result callback back to menu-service —
 * {@code POST /menus/{menuId}/publish-result} — since publishing-service's
 * own {@code POST /publish} is itself async (202 immediately), this
 * callback is how menu-service learns the real PUBLISHED/VALIDATION_FAILED
 * outcome.
 */
@Component
public class MenuServiceCallbackClient {

    private final RestClient restClient;

    public MenuServiceCallbackClient(
            RestClient.Builder restClientBuilder,
            @Value("${menu-service.base-url}") String baseUrl
    ) {
        /* Pinned to the classic HttpURLConnection-based factory — see
         * MenuServiceClient in bulk-import-service for why. */
        this.restClient = restClientBuilder
                .baseUrl(baseUrl)
                .requestFactory(new SimpleClientHttpRequestFactory())
                .build();
    }

    public void sendPublishResult(String menuId, String status, List<String> errors) {
        try {
            restClient.post()
                    .uri("/menus/{menuId}/publish-result", menuId)
                    .body(new PublishResultDto(status, errors))
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException e) {
            throw new MenuServiceCallbackException("failed to deliver publish-result callback for menuId=" + menuId, e);
        }
    }

    private record PublishResultDto(String status, List<String> errors) {
    }
}
