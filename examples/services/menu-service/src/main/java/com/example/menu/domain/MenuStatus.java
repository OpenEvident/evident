package com.example.menu.domain;

/**
 * {@code UPDATES_AVAILABLE} — a published menu whose underlying product
 * changed gets flagged stale, but is never auto-republished. Someone has
 * to explicitly publish again.
 */
public enum MenuStatus {
    DRAFT,
    UPDATES_AVAILABLE,
    PUBLISHING,
    PUBLISHED,
    VALIDATION_FAILED,
    DELETED
}
