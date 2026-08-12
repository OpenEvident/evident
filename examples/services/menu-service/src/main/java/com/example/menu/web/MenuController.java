package com.example.menu.web;

import com.example.menu.domain.Menu;
import com.example.menu.domain.MenuStatus;
import com.example.menu.service.MenuService;
import com.example.menu.web.dto.AttachProductsRequestDto;
import com.example.menu.web.dto.MenuRequestDto;
import com.example.menu.web.dto.MenuResponseDto;
import com.example.menu.web.dto.MenuUpdateRequestDto;
import com.example.menu.web.dto.PublishResultCallbackDto;
import com.example.menu.web.dto.PublishTriggerResponseDto;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MenuController {

    private final MenuService menuService;

    public MenuController(MenuService menuService) {
        this.menuService = menuService;
    }

    @PostMapping("/menus")
    public ResponseEntity<MenuResponseDto> create(@Valid @RequestBody MenuRequestDto request) {
        Menu created = menuService.create(
                request.partnerId(), request.name(), request.countryId(), request.currencyId(),
                request.taxIds(), request.applyMenuLevelTax(), request.categories());
        return ResponseEntity.status(HttpStatus.CREATED).body(MenuResponseDto.from(created));
    }

    @GetMapping("/menus")
    public List<MenuResponseDto> list(
            @RequestParam(required = false) String partnerId,
            @RequestParam(required = false) MenuStatus status
    ) {
        return menuService.findAll(partnerId, status).stream().map(MenuResponseDto::from).toList();
    }

    @GetMapping("/menus/{menuId}")
    public MenuResponseDto get(@PathVariable String menuId) {
        return MenuResponseDto.from(menuService.get(menuId));
    }

    @PutMapping("/menus/{menuId}")
    public MenuResponseDto update(@PathVariable String menuId, @Valid @RequestBody MenuUpdateRequestDto request) {
        Menu updated = menuService.update(
                menuId, request.name(), request.countryId(), request.currencyId(), request.taxIds(), request.applyMenuLevelTax());
        return MenuResponseDto.from(updated);
    }

    @DeleteMapping("/menus/{menuId}")
    public ResponseEntity<Void> delete(@PathVariable String menuId) {
        menuService.delete(menuId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/menus/{menuId}/categories/{categoryId}/products")
    public MenuResponseDto attachProducts(
            @PathVariable String menuId,
            @PathVariable String categoryId,
            @Valid @RequestBody AttachProductsRequestDto request
    ) {
        return MenuResponseDto.from(menuService.attachProducts(menuId, categoryId, request.productIds()));
    }

    @PostMapping("/menus/{menuId}/publish")
    public ResponseEntity<PublishTriggerResponseDto> publish(@PathVariable String menuId) {
        Menu menu = menuService.triggerPublish(menuId);
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(new PublishTriggerResponseDto(menu.getMenuId(), menu.getStatus().name()));
    }

    @PostMapping("/menus/{menuId}/publish-result")
    public ResponseEntity<Void> publishResult(
            @PathVariable String menuId,
            @Valid @RequestBody PublishResultCallbackDto callback
    ) {
        menuService.handlePublishResult(menuId, callback);
        return ResponseEntity.ok().build();
    }
}
