package com.example.menu.service;

public class BatchSizeExceededException extends RuntimeException {

    public BatchSizeExceededException(int actual, int max) {
        super("batch size " + actual + " exceeds max-batch-size " + max);
    }
}
