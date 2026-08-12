package com.example.bulkimport.web;

import com.example.bulkimport.service.SyncWorkflowService;
import com.example.bulkimport.web.dto.SyncRequestDto;
import com.example.bulkimport.web.dto.SyncResponseDto;
import com.example.bulkimport.web.dto.SyncResultCallbackDto;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SyncController {

    private final SyncWorkflowService syncWorkflowService;

    public SyncController(SyncWorkflowService syncWorkflowService) {
        this.syncWorkflowService = syncWorkflowService;
    }

    @PostMapping("/sync")
    public ResponseEntity<SyncResponseDto> sync(@Valid @RequestBody SyncRequestDto request) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(syncWorkflowService.startSync(request));
    }

    @PostMapping("/imports/products/{externalId}/sync-result")
    public ResponseEntity<Void> syncResult(
            @PathVariable String externalId,
            @Valid @RequestBody SyncResultCallbackDto callback
    ) {
        syncWorkflowService.handleSyncResult(externalId, callback);
        return ResponseEntity.ok().build();
    }
}
