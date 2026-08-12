package com.example.publishing.web;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.publishing.domain.MaterializedView;
import com.example.publishing.repository.MaterializedViewRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(MaterializedViewController.class)
class MaterializedViewControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private MaterializedViewRepository repository;

    @Test
    void getReturnsTheMaterializedView() throws Exception {
        when(repository.findByMenuId("menu_1")).thenReturn(
                Optional.of(new MaterializedView("menu_1", "Summer Menu", List.of(), Instant.now())));

        mockMvc.perform(get("/materialized-views/menu_1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.menuId").value("menu_1"));
    }

    @Test
    void getReturns404WhenMissing() throws Exception {
        when(repository.findByMenuId("missing")).thenReturn(Optional.empty());

        mockMvc.perform(get("/materialized-views/missing"))
                .andExpect(status().isNotFound());
    }
}
