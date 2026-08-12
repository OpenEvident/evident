package com.example.bulkimport.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.bulkimport.service.SyncWorkflowService;
import com.example.bulkimport.web.dto.SyncResponseDto;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(SyncController.class)
class SyncControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private SyncWorkflowService syncWorkflowService;

    @Test
    void postSyncReturns202WithSyncId() throws Exception {
        when(syncWorkflowService.startSync(any())).thenReturn(new SyncResponseDto("sync_x9y8z7", 1));

        String body = """
                { "partnerId": "partner-1", "externalIds": ["pos-sku-0001"] }
                """;

        mockMvc.perform(post("/sync").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.syncId").value("sync_x9y8z7"))
                .andExpect(jsonPath("$.selectedCount").value(1));
    }

    @Test
    void postSyncRejectsAnEmptyExternalIdList() throws Exception {
        String body = """
                { "partnerId": "partner-1", "externalIds": [] }
                """;

        mockMvc.perform(post("/sync").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest());
    }

    @Test
    void postSyncResultInvokesTheWorkflowService() throws Exception {
        String body = """
                { "syncId": "sync_x9y8z7", "productId": "prod_9f8e7d", "status": "SYNCED" }
                """;

        mockMvc.perform(post("/imports/products/pos-sku-0001/sync-result")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());

        verify(syncWorkflowService).handleSyncResult(org.mockito.ArgumentMatchers.eq("pos-sku-0001"), any());
    }
}
