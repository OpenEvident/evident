package com.example.caller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class ReceiverClient {

    private static final Logger log = LoggerFactory.getLogger(ReceiverClient.class);

    private final RestClient restClient;

    public ReceiverClient(@Value("${receiver.base-url}") String receiverBaseUrl) {
        this.restClient = RestClient.builder().baseUrl(receiverBaseUrl).build();
    }

    public void callReceiverSync(String recordId, long delayMs) {
        log.info("calling receiver synchronously for record {}", recordId);
        callReceiver(recordId, delayMs);
        log.info("receiver call completed for record {}", recordId);
    }

    @Async
    public void callReceiverAsync(String recordId, long delayMs) {
        log.info("calling receiver asynchronously for record {}", recordId);
        callReceiver(recordId, delayMs);
        log.info("async receiver call completed for record {}", recordId);
    }

    private void callReceiver(String recordId, long delayMs) {
        restClient.post()
                .uri("/process")
                .body(new ProcessRequest(recordId, delayMs))
                .retrieve()
                .toBodilessEntity();
    }

    private record ProcessRequest(String recordId, long delayMs) {
    }
}
