package com.example.caller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TriggerController {

    private static final Logger log = LoggerFactory.getLogger(TriggerController.class);

    private final ReceiverClient receiverClient;

    public TriggerController(ReceiverClient receiverClient) {
        this.receiverClient = receiverClient;
    }

    @PostMapping("/trigger")
    public ResponseEntity<TriggerResponse> trigger(@RequestBody TriggerRequest request) {
        log.info("trigger received for record {} (mode={}, delayMs={})",
                request.recordId(), request.mode(), request.delayMs());

        if (request.simulateFailure()) {
            log.warn("simulateFailure set for record {} — returning error without calling receiver",
                    request.recordId());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(new TriggerResponse(request.recordId(), "failed"));
        }

        if ("async".equals(request.mode())) {
            receiverClient.callReceiverAsync(request.recordId(), request.delayMs());
            return ResponseEntity.accepted().body(new TriggerResponse(request.recordId(), "accepted"));
        }

        receiverClient.callReceiverSync(request.recordId(), request.delayMs());
        return ResponseEntity.ok(new TriggerResponse(request.recordId(), "completed"));
    }
}
