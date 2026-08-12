package com.example.bulkimport.domain;

public record ImportItemOutcome(String externalId, ImportOutcome outcome, String contentHash) {
}
