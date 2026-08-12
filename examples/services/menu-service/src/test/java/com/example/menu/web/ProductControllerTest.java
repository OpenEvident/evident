package com.example.menu.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.menu.service.ProductBulkOrchestrator;
import com.example.menu.service.ProductService;
import com.example.menu.web.dto.BulkProductResponseDto;
import com.example.menu.web.dto.BulkStatusResponseDto;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(ProductController.class)
class ProductControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ProductService productService;
    @MockitoBean
    private ProductBulkOrchestrator bulkOrchestrator;

    @Test
    void postProductsBulkReturns202WithBatchId() throws Exception {
        when(bulkOrchestrator.startBulk(any())).thenReturn(new BulkProductResponseDto("batch_abc123", 1));

        String body = """
                {
                  "partnerId": "partner-1",
                  "syncId": "sync_x9y8z7",
                  "items": [
                    { "externalId": "pos-sku-0001", "action": "CREATE", "sku": "SKU-0001", "name": "Cheeseburger",
                      "prices": [ { "currencyId": "cur_aed_001", "amount": 1300, "taxInclusive": false, "taxIds": ["tax_vat_ae_001"] } ] }
                  ]
                }
                """;

        mockMvc.perform(post("/products/bulk").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.batchId").value("batch_abc123"));
    }

    @Test
    void getBulkStatusReturnsTheOutcome() throws Exception {
        when(bulkOrchestrator.getStatus("batch_abc123"))
                .thenReturn(new BulkStatusResponseDto("batch_abc123", 3, 2, 1, "PARTIALLY_COMPLETED"));

        mockMvc.perform(get("/bulk/batch_abc123/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PARTIALLY_COMPLETED"));
    }

    @Test
    void postProductsBulkRejectsAnEmptyItemList() throws Exception {
        String body = """
                { "partnerId": "partner-1", "syncId": "sync_x9y8z7", "items": [] }
                """;

        mockMvc.perform(post("/products/bulk").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest());
    }
}
