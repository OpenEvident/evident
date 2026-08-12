package com.example.publishing;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class PublishingServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(PublishingServiceApplication.class, args);
    }
}
