package com.example.menu.web;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.menu.domain.ReferenceStatus;
import com.example.menu.domain.Tax;
import com.example.menu.service.refdata.TaxService;
import java.math.BigDecimal;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(TaxController.class)
class TaxControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private TaxService taxService;

    @Test
    void getTaxesByNameAndPercentageReturnsAMatch() throws Exception {
        when(taxService.findByNameAndPercentage("UAE VAT", new BigDecimal("5.00"))).thenReturn(
                Optional.of(new Tax("tax_vat_ae_001", "UAE VAT", new BigDecimal("5.00"), "cty_ae_001", ReferenceStatus.ACTIVE, 1)));

        mockMvc.perform(get("/taxes").param("name", "UAE VAT").param("percentage", "5.00"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value("tax_vat_ae_001"));
    }

    @Test
    void postTaxCreatesAGloballyScopedTaxWhenNoCountryIdGiven() throws Exception {
        when(taxService.create("Service Tax", new BigDecimal("2.00"), null)).thenReturn(
                new Tax("tax_service_001", "Service Tax", new BigDecimal("2.00"), null, ReferenceStatus.ACTIVE, 1));

        String body = """
                { "name": "Service Tax", "percentage": 2.00 }
                """;

        mockMvc.perform(post("/taxes").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.countryId").value(org.hamcrest.Matchers.nullValue()));
    }
}
