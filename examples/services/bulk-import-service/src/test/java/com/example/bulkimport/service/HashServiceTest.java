package com.example.bulkimport.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.bulkimport.domain.ImportPayload;
import com.example.bulkimport.domain.TaxAssignment;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class HashServiceTest {

    private final HashService hashService = new HashService();

    @Test
    void hashesAreStableForIdenticalPayloads() {
        ImportPayload payload = payload("SKU-1", "Cheeseburger", "13.00", "AED", "UAE VAT", "5.00");

        String first = hashService.hashPayload(payload);
        String second = hashService.hashPayload(payload);

        assertThat(first).isEqualTo(second);
        assertThat(first).startsWith("sha256:");
    }

    @Test
    void hashIsInsensitiveToCosmeticNumberFormatting() {
        ImportPayload withTrailingZeros = payload("SKU-1", "Cheeseburger", "13.00", "AED", "UAE VAT", "5.00");
        ImportPayload withoutTrailingZeros = payload("SKU-1", "Cheeseburger", "13", "AED", "UAE VAT", "5");

        assertThat(hashService.hashPayload(withTrailingZeros)).isEqualTo(hashService.hashPayload(withoutTrailingZeros));
    }

    @Test
    void hashChangesWhenPriceChanges() {
        ImportPayload original = payload("SKU-1", "Cheeseburger", "13.00", "AED", "UAE VAT", "5.00");
        ImportPayload changed = payload("SKU-1", "Cheeseburger", "15.00", "AED", "UAE VAT", "5.00");

        assertThat(hashService.hashPayload(original)).isNotEqualTo(hashService.hashPayload(changed));
    }

    @Test
    void hashChangesWhenTaxAssignmentChanges() {
        ImportPayload original = payload("SKU-1", "Cheeseburger", "13.00", "AED", "UAE VAT", "5.00");
        ImportPayload changed = payload("SKU-1", "Cheeseburger", "13.00", "AED", "UAE VAT", "7.00");

        assertThat(hashService.hashPayload(original)).isNotEqualTo(hashService.hashPayload(changed));
    }

    @Test
    void hashChangesWhenNameChanges() {
        ImportPayload original = payload("SKU-1", "Cheeseburger", "13.00", "AED", "UAE VAT", "5.00");
        ImportPayload renamed = payload("SKU-1", "Double Cheeseburger", "13.00", "AED", "UAE VAT", "5.00");

        assertThat(hashService.hashPayload(original)).isNotEqualTo(hashService.hashPayload(renamed));
    }

    private ImportPayload payload(String sku, String name, String price, String currency, String taxName, String taxPct) {
        return new ImportPayload(sku, name, new BigDecimal(price), currency, new TaxAssignment(taxName, new BigDecimal(taxPct)));
    }
}
