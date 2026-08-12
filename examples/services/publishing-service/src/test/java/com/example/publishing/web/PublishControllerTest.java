package com.example.publishing.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.publishing.service.PublishOrchestrator;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(PublishController.class)
class PublishControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private PublishOrchestrator orchestrator;

    @Test
    void postPublishReturns202AndDelegatesToTheOrchestrator() throws Exception {
        String body = """
                {
                  "menuId": "menu_1",
                  "name": "Summer Menu",
                  "countryId": "cty_ae_001",
                  "currencyId": "cur_aed_001",
                  "currencyPrecision": 2,
                  "menuTaxIds": [],
                  "applyMenuLevelTax": false,
                  "categories": [],
                  "taxes": []
                }
                """;

        mockMvc.perform(post("/publish").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.menuId").value("menu_1"))
                .andExpect(jsonPath("$.status").value("VALIDATING"));

        verify(orchestrator).process(any());
    }

    @Test
    void postPublishRejectsAMissingMenuId() throws Exception {
        String body = """
                {
                  "menuId": "",
                  "currencyId": "cur_aed_001",
                  "currencyPrecision": 2,
                  "menuTaxIds": [],
                  "applyMenuLevelTax": false,
                  "categories": [],
                  "taxes": []
                }
                """;

        mockMvc.perform(post("/publish").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest());
    }
}
