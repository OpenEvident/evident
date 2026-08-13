package com.example.menu.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.menu.domain.Category;
import com.example.menu.domain.Menu;
import com.example.menu.domain.MenuStatus;
import com.example.menu.service.MenuService;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(MenuController.class)
class MenuControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private MenuService menuService;

    @Test
    void publishReturns202WithPublishingStatus() throws Exception {
        Menu publishing = new Menu("menu_1", "partner-1", "Summer Menu", "cty_ae_001", "cur_aed_001",
                List.of(), true, List.of(), MenuStatus.PUBLISHING, 2, Instant.now(), null);
        when(menuService.triggerPublish("menu_1")).thenReturn(publishing);

        mockMvc.perform(post("/menus/menu_1/publish"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("PUBLISHING"));
    }

    @Test
    void publishResultAcceptsTheCallback() throws Exception {
        String body = """
                { "status": "PUBLISHED", "errors": null }
                """;

        mockMvc.perform(post("/menus/menu_1/publish-result").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
    }

    @Test
    void deleteReturns204AndDelegatesToTheService() throws Exception {
        mockMvc.perform(delete("/menus/menu_1"))
                .andExpect(status().isNoContent());

        verify(menuService).delete("menu_1");
    }

    @Test
    void attachProductsReturnsTheUpdatedMenu() throws Exception {
        Category burgers = new Category("cat_burgers", "Burgers", List.of(), List.of("prod_9f8e7d"));
        Menu menu = new Menu("menu_1", "partner-1", "Summer Menu", "cty_ae_001", "cur_aed_001",
                List.of(), true, List.of(burgers), MenuStatus.DRAFT, 2, Instant.now(), null);
        when(menuService.attachProducts(anyString(), anyString(), anyList())).thenReturn(menu);

        String body = """
                { "productIds": ["prod_9f8e7d"] }
                """;

        mockMvc.perform(post("/menus/menu_1/categories/cat_burgers/products")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.categories[0].productIds[0]").value("prod_9f8e7d"));
    }
}
