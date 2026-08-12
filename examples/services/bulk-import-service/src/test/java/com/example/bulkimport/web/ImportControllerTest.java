package com.example.bulkimport.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.bulkimport.repository.ImportRequestRepository;
import com.example.bulkimport.repository.ImportedProductRepository;
import com.example.bulkimport.service.ImportService;
import com.example.bulkimport.web.dto.ImportResponseDto;
import com.example.bulkimport.web.dto.ImportSummaryDto;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(ImportController.class)
class ImportControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ImportService importService;
    @MockitoBean
    private ImportedProductRepository importedProductRepository;
    @MockitoBean
    private ImportRequestRepository importRequestRepository;

    @Test
    void postImportsReturns202WithSummary() throws Exception {
        when(importService.processImport(any())).thenReturn(
                new ImportResponseDto("req_abc123", 1, new ImportSummaryDto(1, 0, 0), List.of()));

        String body = """
                {
                  "partnerId": "partner-1",
                  "items": [
                    {
                      "externalId": "pos-sku-0001",
                      "sku": "SKU-0001",
                      "name": "Cheeseburger",
                      "price": 13.00,
                      "currencyCode": "AED",
                      "taxAssignment": { "name": "UAE VAT", "percentage": 5.00 }
                    }
                  ]
                }
                """;

        mockMvc.perform(post("/imports").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.requestId").value("req_abc123"))
                .andExpect(jsonPath("$.summary.new").value(1));
    }

    @Test
    void postImportsRejectsAnEmptyItemList() throws Exception {
        String body = """
                { "partnerId": "partner-1", "items": [] }
                """;

        mockMvc.perform(post("/imports").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest());
    }

    @Test
    void getImportedProductReturns404WhenMissing() throws Exception {
        when(importedProductRepository.findByPartnerIdAndExternalId("partner-1", "missing"))
                .thenReturn(java.util.Optional.empty());

        mockMvc.perform(get("/imports/products/missing").param("partnerId", "partner-1"))
                .andExpect(status().isNotFound());
    }
}
