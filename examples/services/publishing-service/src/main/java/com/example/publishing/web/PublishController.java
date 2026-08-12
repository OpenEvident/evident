package com.example.publishing.web;

import com.example.publishing.service.PublishOrchestrator;
import com.example.publishing.web.dto.PublishAcceptedResponseDto;
import com.example.publishing.web.dto.PublishRequestDto;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PublishController {

    private final PublishOrchestrator orchestrator;

    public PublishController(PublishOrchestrator orchestrator) {
        this.orchestrator = orchestrator;
    }

    @PostMapping("/publish")
    public ResponseEntity<PublishAcceptedResponseDto> publish(@Valid @RequestBody PublishRequestDto request) {
        orchestrator.process(request);
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(new PublishAcceptedResponseDto(request.menuId(), "VALIDATING"));
    }
}
