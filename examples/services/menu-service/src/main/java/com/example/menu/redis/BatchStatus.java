package com.example.menu.redis;

public record BatchStatus(int total, int completed, int failed) {

    public String outcome() {
        if (completed + failed < total) {
            return "PROCESSING";
        }
        return failed == 0 ? "COMPLETED" : "PARTIALLY_COMPLETED";
    }
}
