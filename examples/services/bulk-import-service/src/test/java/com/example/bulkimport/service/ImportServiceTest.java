package com.example.bulkimport.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.bulkimport.domain.ImportOutcome;
import com.example.bulkimport.domain.ImportPayload;
import com.example.bulkimport.domain.ImportedProduct;
import com.example.bulkimport.domain.SelectionStatus;
import com.example.bulkimport.domain.TaxAssignment;
import com.example.bulkimport.repository.ImportRequestRepository;
import com.example.bulkimport.repository.ImportedProductRepository;
import com.example.bulkimport.web.dto.ImportItemRequestDto;
import com.example.bulkimport.web.dto.ImportRequestDto;
import com.example.bulkimport.web.dto.ImportResponseDto;
import com.example.bulkimport.web.dto.SyncRequestDto;
import com.example.bulkimport.web.dto.TaxAssignmentDto;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ImportServiceTest {

    @Mock
    private ImportedProductRepository importedProductRepository;
    @Mock
    private ImportRequestRepository importRequestRepository;
    @Mock
    private SyncWorkflowService syncWorkflowService;

    private ImportService importService;

    @BeforeEach
    void setUp() {
        importService = new ImportService(
                importedProductRepository,
                importRequestRepository,
                new HashService(),
                new IdGenerator(),
                syncWorkflowService,
                500
        );
        org.mockito.Mockito.lenient()
                .when(importedProductRepository.save(any(ImportedProduct.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void classifiesAFirstTimeItemAsNew() {
        when(importedProductRepository.findByPartnerIdAndExternalId("partner-1", "pos-sku-0001"))
                .thenReturn(Optional.empty());

        ImportResponseDto response = importService.processImport(importRequest("pos-sku-0001", "13.00"));

        assertThat(response.summary().newCount()).isEqualTo(1);
        assertThat(response.summary().updatedCount()).isZero();
        assertThat(response.summary().unchangedCount()).isZero();
        verify(syncWorkflowService, never()).startSync(any());
    }

    @Test
    void classifiesAnIdenticalReimportAsUnchangedAndDoesNotBumpVersion() {
        ImportedProduct existing = new ImportedProduct(
                "partner-1", "pos-sku-0001",
                payload("13.00"), new HashService().hashPayload(payload("13.00")),
                SelectionStatus.SELECTED, ImportOutcome.NEW, 1, Instant.now(), Instant.now());
        when(importedProductRepository.findByPartnerIdAndExternalId("partner-1", "pos-sku-0001"))
                .thenReturn(Optional.of(existing));

        ImportResponseDto response = importService.processImport(importRequest("pos-sku-0001", "13.00"));

        assertThat(response.summary().unchangedCount()).isEqualTo(1);
        ArgumentCaptor<ImportedProduct> captor = ArgumentCaptor.forClass(ImportedProduct.class);
        verify(importedProductRepository).save(captor.capture());
        assertThat(captor.getValue().getVersion()).isEqualTo(1);
        verify(syncWorkflowService, never()).startSync(any());
    }

    @Test
    void updatedAndAlreadySelectedItemAutoTriggersSync() {
        ImportedProduct existing = new ImportedProduct(
                "partner-1", "pos-sku-0001",
                payload("13.00"), new HashService().hashPayload(payload("13.00")),
                SelectionStatus.SELECTED, ImportOutcome.NEW, 1, Instant.now(), Instant.now());
        when(importedProductRepository.findByPartnerIdAndExternalId("partner-1", "pos-sku-0001"))
                .thenReturn(Optional.of(existing));

        ImportResponseDto response = importService.processImport(importRequest("pos-sku-0001", "15.00"));

        assertThat(response.summary().updatedCount()).isEqualTo(1);
        assertThat(response.autoSyncTriggered()).containsExactly("pos-sku-0001");
        ArgumentCaptor<SyncRequestDto> captor = ArgumentCaptor.forClass(SyncRequestDto.class);
        verify(syncWorkflowService).startSync(captor.capture());
        assertThat(captor.getValue().externalIds()).containsExactly("pos-sku-0001");

        ArgumentCaptor<ImportedProduct> savedCaptor = ArgumentCaptor.forClass(ImportedProduct.class);
        verify(importedProductRepository).save(savedCaptor.capture());
        assertThat(savedCaptor.getValue().getVersion()).isEqualTo(2);
    }

    @Test
    void updatedButNotYetSelectedItemDoesNotAutoTriggerSync() {
        ImportedProduct existing = new ImportedProduct(
                "partner-1", "pos-sku-0001",
                payload("13.00"), new HashService().hashPayload(payload("13.00")),
                SelectionStatus.NOT_SELECTED, ImportOutcome.NEW, 1, Instant.now(), Instant.now());
        when(importedProductRepository.findByPartnerIdAndExternalId("partner-1", "pos-sku-0001"))
                .thenReturn(Optional.of(existing));

        ImportResponseDto response = importService.processImport(importRequest("pos-sku-0001", "15.00"));

        assertThat(response.autoSyncTriggered()).isEmpty();
        verify(syncWorkflowService, never()).startSync(any());
    }

    @Test
    void rejectsABatchLargerThanTheConfiguredMax() {
        ImportService smallLimitService = new ImportService(
                importedProductRepository, importRequestRepository, new HashService(), new IdGenerator(),
                syncWorkflowService, 1);
        ImportRequestDto request = new ImportRequestDto("partner-1", List.of(
                item("pos-sku-0001", "13.00"), item("pos-sku-0002", "14.00")));

        org.junit.jupiter.api.Assertions.assertThrows(BatchSizeExceededException.class,
                () -> smallLimitService.processImport(request));
    }

    private ImportRequestDto importRequest(String externalId, String price) {
        return new ImportRequestDto("partner-1", List.of(item(externalId, price)));
    }

    private ImportItemRequestDto item(String externalId, String price) {
        return new ImportItemRequestDto(
                externalId, "SKU-1", "Cheeseburger", new BigDecimal(price), "AED",
                new TaxAssignmentDto("UAE VAT", new BigDecimal("5.00")));
    }

    private ImportPayload payload(String price) {
        return new ImportPayload("SKU-1", "Cheeseburger", new BigDecimal(price), "AED",
                new TaxAssignment("UAE VAT", new BigDecimal("5.00")));
    }
}
