package com.example.bulkimport;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class BulkImportServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(BulkImportServiceApplication.class, args);
    }
}
