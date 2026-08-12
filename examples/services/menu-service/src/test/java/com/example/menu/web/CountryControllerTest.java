package com.example.menu.web;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.menu.domain.Country;
import com.example.menu.domain.ReferenceStatus;
import com.example.menu.service.refdata.CountryService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(CountryController.class)
class CountryControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private CountryService countryService;

    @Test
    void postCountryReturns201() throws Exception {
        when(countryService.create(anyString(), anyString(), anyString()))
                .thenReturn(new Country("cty_ae_001", "AE", "United Arab Emirates", "cur_aed_001", ReferenceStatus.ACTIVE));

        String body = """
                { "code": "AE", "name": "United Arab Emirates", "defaultCurrencyId": "cur_aed_001" }
                """;

        mockMvc.perform(post("/countries").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value("AE"));
    }

    @Test
    void postCountryRejectsAMissingCode() throws Exception {
        String body = """
                { "code": "", "name": "United Arab Emirates", "defaultCurrencyId": "cur_aed_001" }
                """;

        mockMvc.perform(post("/countries").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest());
    }
}
