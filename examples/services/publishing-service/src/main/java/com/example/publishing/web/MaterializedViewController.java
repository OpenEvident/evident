package com.example.publishing.web;

import com.example.publishing.repository.MaterializedViewRepository;
import com.example.publishing.web.dto.MaterializedViewResponseDto;
import java.util.NoSuchElementException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MaterializedViewController {

    private final MaterializedViewRepository repository;

    public MaterializedViewController(MaterializedViewRepository repository) {
        this.repository = repository;
    }

    @GetMapping("/materialized-views/{menuId}")
    public MaterializedViewResponseDto get(@PathVariable String menuId) {
        return repository.findByMenuId(menuId)
                .map(MaterializedViewResponseDto::from)
                .orElseThrow(() -> new NoSuchElementException("no materialized view for menuId=" + menuId));
    }
}
