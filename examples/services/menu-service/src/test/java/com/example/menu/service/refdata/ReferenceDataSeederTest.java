package com.example.menu.service.refdata;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.menu.domain.Country;
import com.example.menu.domain.Currency;
import com.example.menu.domain.ReferenceStatus;
import com.example.menu.domain.Tax;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ReferenceDataSeederTest {

    @Mock
    private CountryService countryService;
    @Mock
    private CurrencyService currencyService;
    @Mock
    private TaxService taxService;

    @Test
    void doesNotRecreateAnyRecordThatAlreadyExists() {
        when(currencyService.findByCode(anyString())).thenReturn(
                java.util.Optional.of(new Currency("cur_x", "AED", "UAE Dirham", 2, ReferenceStatus.ACTIVE)));
        when(countryService.findByCode(anyString())).thenReturn(
                java.util.Optional.of(new Country("cty_x", "AE", "United Arab Emirates", "cur_x", ReferenceStatus.ACTIVE)));
        when(taxService.findByNameAndPercentage(anyString(), any(BigDecimal.class))).thenReturn(
                java.util.Optional.of(new Tax("tax_x", "UAE VAT", new BigDecimal("5.00"), "cty_x", ReferenceStatus.ACTIVE, 1)));

        new ReferenceDataSeeder(countryService, currencyService, taxService).run(null);

        verify(currencyService, never()).create(anyString(), anyString(), org.mockito.ArgumentMatchers.anyInt());
        verify(countryService, never()).create(anyString(), anyString(), anyString());
        verify(taxService, never()).create(anyString(), any(BigDecimal.class), org.mockito.ArgumentMatchers.any());
    }
}
