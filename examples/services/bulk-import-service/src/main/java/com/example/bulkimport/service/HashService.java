package com.example.bulkimport.service;

import com.example.bulkimport.domain.ImportPayload;
import com.example.bulkimport.domain.TaxAssignment;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import org.springframework.stereotype.Component;

/**
 * Computes the Import-workflow content hash — over {@link ImportPayload}
 * fields only. Numeric fields are normalized before hashing (e.g.
 * {@code 13.0} and {@code 13.00} hash identically) so a purely cosmetic
 * formatting difference upstream can never register as a change.
 */
@Component
public class HashService {

    public String hashPayload(ImportPayload payload) {
        String canonical = canonicalize(payload);
        return "sha256:" + sha256Hex(canonical);
    }

    private String canonicalize(ImportPayload payload) {
        TaxAssignment tax = payload.taxAssignment();
        return String.join(
                "|",
                nullToEmpty(payload.sku()),
                nullToEmpty(payload.name()),
                normalizeNumber(payload.price()),
                nullToEmpty(payload.currencyCode()),
                tax == null ? "" : nullToEmpty(tax.name()),
                tax == null ? "" : normalizeNumber(tax.percentage())
        );
    }

    private String normalizeNumber(BigDecimal value) {
        return value == null ? "" : value.stripTrailingZeros().toPlainString();
    }

    private String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private String sha256Hex(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }
}
