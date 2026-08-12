package com.example.menu.service;

import java.security.SecureRandom;
import java.util.HexFormat;
import org.springframework.stereotype.Component;

/**
 * Generates short, prefixed, human-scannable IDs (e.g. {@code prod_9f8e7d},
 * {@code menu_p1q2r3}) matching the shape used throughout
 * {@code NEXT_SERVICES_DESIGN.md}'s examples and log lines.
 */
@Component
public class IdGenerator {

    private static final SecureRandom RANDOM = new SecureRandom();

    public String generate(String prefix) {
        byte[] bytes = new byte[3];
        RANDOM.nextBytes(bytes);
        return prefix + "_" + HexFormat.of().formatHex(bytes);
    }
}
