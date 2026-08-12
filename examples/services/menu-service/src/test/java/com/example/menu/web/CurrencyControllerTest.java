package com.example.menu.web;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.menu.domain.Currency;
import com.example.menu.domain.ReferenceStatus;
import com.example.menu.service.refdata.CurrencyService;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(CurrencyController.class)
class CurrencyControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private CurrencyService currencyService;

    @Test
    void getCurrenciesByCodeReturnsASingleMatch() throws Exception {
        when(currencyService.findByCode("AED"))
                .thenReturn(Optional.of(new Currency("cur_aed_001", "AED", "UAE Dirham", 2, ReferenceStatus.ACTIVE)));

        mockMvc.perform(get("/currencies").param("code", "AED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value("cur_aed_001"));
    }

    @Test
    void getCurrenciesByUnknownCodeReturnsAnEmptyList() throws Exception {
        when(currencyService.findByCode("ZZZ")).thenReturn(Optional.empty());

        mockMvc.perform(get("/currencies").param("code", "ZZZ"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }
}
