package com.example.caller;

/**
 * mode is "sync" (block on the receiver call) or "async" (return
 * immediately, call the receiver in the background) — the two trigger
 * shapes the Evident framework's V1 correlation proof needs to cover.
 */
public record TriggerRequest(String recordId, long delayMs, String mode, boolean simulateFailure) {
}
