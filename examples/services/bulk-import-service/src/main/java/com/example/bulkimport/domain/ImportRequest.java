package com.example.bulkimport.domain;

import java.time.Instant;
import java.util.List;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * Immutable audit log entry — one per {@code POST /imports} call. Never
 * updated after creation.
 */
@Document("import_requests")
public class ImportRequest {

    @Id
    private String id;
    @Indexed(unique = true)
    private String requestId;
    private String partnerId;
    private Instant receivedAt;
    private List<ImportItemOutcome> items;

    protected ImportRequest() {
        // for Spring Data materialization
    }

    public ImportRequest(String requestId, String partnerId, Instant receivedAt, List<ImportItemOutcome> items) {
        this.requestId = requestId;
        this.partnerId = partnerId;
        this.receivedAt = receivedAt;
        this.items = items;
    }

    public String getId() {
        return id;
    }

    public String getRequestId() {
        return requestId;
    }

    public String getPartnerId() {
        return partnerId;
    }

    public Instant getReceivedAt() {
        return receivedAt;
    }

    public List<ImportItemOutcome> getItems() {
        return items;
    }
}
