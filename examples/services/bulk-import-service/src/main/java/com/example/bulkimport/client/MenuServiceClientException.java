package com.example.bulkimport.client;

public class MenuServiceClientException extends RuntimeException {

    public MenuServiceClientException(String message, Throwable cause) {
        super(message, cause);
    }

    public MenuServiceClientException(String message) {
        super(message);
    }
}
