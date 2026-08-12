package com.example.menu.service.refdata;

import java.math.BigDecimal;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * Idempotent illustrative seed data — AE/SA/GB, AED/SAR/GBP/USD, and 4
 * taxes, exactly matching the table confirmed in NEXT_SERVICES_DESIGN.md.
 * Checked by natural key (currency/country code, tax name+percentage) on
 * every startup so re-running never creates duplicates.
 */
@Component
public class ReferenceDataSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(ReferenceDataSeeder.class);

    private final CountryService countryService;
    private final CurrencyService currencyService;
    private final TaxService taxService;

    public ReferenceDataSeeder(CountryService countryService, CurrencyService currencyService, TaxService taxService) {
        this.countryService = countryService;
        this.currencyService = currencyService;
        this.taxService = taxService;
    }

    @Override
    public void run(ApplicationArguments args) {
        String aed = ensureCurrency("AED", "UAE Dirham", 2);
        String sar = ensureCurrency("SAR", "Saudi Riyal", 2);
        String gbp = ensureCurrency("GBP", "British Pound", 2);
        ensureCurrency("USD", "US Dollar", 2);

        String ae = ensureCountry("AE", "United Arab Emirates", aed);
        String sa = ensureCountry("SA", "Saudi Arabia", sar);
        String gb = ensureCountry("GB", "United Kingdom", gbp);

        ensureTax("UAE VAT", new BigDecimal("5.00"), ae);
        ensureTax("KSA VAT", new BigDecimal("15.00"), sa);
        ensureTax("UK VAT", new BigDecimal("20.00"), gb);
        ensureTax("Service Tax", new BigDecimal("2.00"), null);

        log.info("reference data seed check complete");
    }

    private String ensureCurrency(String code, String name, int precision) {
        return currencyService.findByCode(code)
                .map(c -> c.getId())
                .orElseGet(() -> currencyService.create(code, name, precision).getId());
    }

    private String ensureCountry(String code, String name, String defaultCurrencyId) {
        return countryService.findByCode(code)
                .map(c -> c.getId())
                .orElseGet(() -> countryService.create(code, name, defaultCurrencyId).getId());
    }

    private void ensureTax(String name, BigDecimal percentage, String countryId) {
        taxService.findByNameAndPercentage(name, percentage)
                .orElseGet(() -> taxService.create(name, percentage, countryId));
    }
}
