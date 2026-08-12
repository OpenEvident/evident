package com.example.bulkimport.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.example.bulkimport.domain.ImportOutcome;
import com.example.bulkimport.domain.ImportPayload;
import com.example.bulkimport.domain.ImportedProduct;
import com.example.bulkimport.domain.SelectionStatus;
import com.example.bulkimport.domain.SyncedProduct;
import com.example.bulkimport.domain.TaxAssignment;
import com.example.bulkimport.redis.SyncRedisStateStore;
import com.example.bulkimport.repository.ImportedProductRepository;
import com.example.bulkimport.repository.SyncedProductRepository;
import com.example.bulkimport.service.SyncRecoveryRunner;
import com.example.bulkimport.web.dto.SyncRequestDto;
import com.example.bulkimport.web.dto.SyncResponseDto;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.restclient.RestTemplateBuilder;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

/**
 * Exercises the real Sync workflow end to end against real Mongo and real
 * Redis (Testcontainers) — the two mechanisms hardest to get right by
 * inspection alone: the second-hash skip-on-unchanged no-op, and Redis
 * restart recovery. menu-service itself is stood in for by
 * {@link FakeMenuService}, since this suite's job is to prove
 * bulk-import-service's own workflow, not menu-service's (which has its
 * own test suite).
 */
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
class SyncWorkflowIntegrationTest {

    /**
     * Forces the classic HttpURLConnection-based request factory for
     * TestRestTemplate — Spring's default detection otherwise picks the
     * JDK's java.net.http.HttpClient, which fails outright on this dev
     * machine (loopback selector pipe blocked by local security software),
     * same issue documented on {@code MenuServiceClient}.
     */
    @TestConfiguration
    static class TestRestTemplateConfig {
        @Bean
        RestTemplateBuilder restTemplateBuilder() {
            return new RestTemplateBuilder().requestFactory(SimpleClientHttpRequestFactory::new);
        }
    }

    @Container
    static MongoDBContainer mongo = new MongoDBContainer(DockerImageName.parse("mongo:7.0"));

    @Container
    static GenericContainer<?> redis = new GenericContainer<>(DockerImageName.parse("redis:7-alpine"))
            .withExposedPorts(6379);

    static FakeMenuService fakeMenuService;

    @BeforeAll
    static void startFakeMenuService() {
        fakeMenuService = new FakeMenuService();
    }

    @AfterAll
    static void stopFakeMenuService() {
        fakeMenuService.stop();
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.data.mongodb.uri", mongo::getReplicaSetUrl);
        registry.add("spring.data.redis.host", redis::getHost);
        registry.add("spring.data.redis.port", () -> redis.getMappedPort(6379));
        registry.add("menu-service.base-url", () -> fakeMenuService.baseUrl());
    }

    @LocalServerPort
    private int localPort;

    @Autowired
    private TestRestTemplate restTemplate;
    @Autowired
    private ImportedProductRepository importedProductRepository;
    @Autowired
    private SyncedProductRepository syncedProductRepository;
    @Autowired
    private SyncRedisStateStore syncRedisStateStore;
    @Autowired
    private SyncRecoveryRunner syncRecoveryRunner;
    @Autowired
    private org.springframework.data.redis.core.StringRedisTemplate stringRedisTemplate;

    private boolean callbackTargetConfigured = false;

    /**
     * Each test method seeds and asserts on its own externalIds, but the
     * Mongo/Redis containers are shared across the whole class (started
     * once) — clearing state per method keeps tests order-independent and
     * safe to re-run without depending on exactly which containers/ports
     * a previous JVM run left behind.
     */
    @org.junit.jupiter.api.BeforeEach
    void cleanState() {
        importedProductRepository.deleteAll();
        syncedProductRepository.deleteAll();
        stringRedisTemplate.execute((org.springframework.data.redis.connection.RedisConnection connection) -> {
            connection.serverCommands().flushDb();
            return null;
        });
    }

    private void ensureCallbackTargetConfigured() {
        if (!callbackTargetConfigured) {
            fakeMenuService.setCallbackTargetPort(localPort);
            fakeMenuService.seedCurrency("AED", "cur_aed_001", 2);
            fakeMenuService.seedTax("UAE VAT", "5.00", "tax_vat_ae_001");
            callbackTargetConfigured = true;
        }
    }

    @Test
    void syncDispatchesANewProductAndCompletesViaCallback() {
        ensureCallbackTargetConfigured();
        seedImportedProduct("partner-1", "pos-sku-0001", "13.00");

        SyncResponseDto response = restTemplate.postForObject(
                "http://localhost:" + localPort + "/sync",
                new SyncRequestDto("partner-1", java.util.List.of("pos-sku-0001")),
                SyncResponseDto.class);

        assertThat(response.syncId()).isNotBlank();
        assertThat(response.selectedCount()).isEqualTo(1);

        await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> {
            var synced = syncedProductRepository.findByPartnerIdAndExternalId("partner-1", "pos-sku-0001");
            assertThat(synced).isPresent();
            assertThat(synced.get().getProductId()).isNotBlank();
            assertThat(synced.get().getResolvedCurrencyId()).isEqualTo("cur_aed_001");

            var imported = importedProductRepository.findByPartnerIdAndExternalId("partner-1", "pos-sku-0001");
            assertThat(imported).isPresent();
            assertThat(imported.get().getSelectionStatus()).isEqualTo(SelectionStatus.SELECTED);
        });
    }

    @Test
    void syncSkipsAnItemThatIsAlreadyUpToDate() {
        ensureCallbackTargetConfigured();
        String contentHash = seedImportedProduct("partner-1", "pos-sku-0002", "20.00");
        syncedProductRepository.save(new SyncedProduct(
                "partner-1", "pos-sku-0002", "prod_existing",
                "cur_aed_001", java.util.List.of("tax_vat_ae_001"), contentHash, Instant.now()));

        int callsBefore = fakeMenuService.bulkDispatchCallCount();

        SyncResponseDto response = restTemplate.postForObject(
                "http://localhost:" + localPort + "/sync",
                new SyncRequestDto("partner-1", java.util.List.of("pos-sku-0002")),
                SyncResponseDto.class);

        assertThat(response.selectedCount()).isEqualTo(1);

        // Give the async worker a moment, then assert dispatch never happened — proving the negative.
        await().pollDelay(Duration.ofMillis(500)).atMost(Duration.ofSeconds(5)).untilAsserted(() ->
                assertThat(fakeMenuService.bulkDispatchCallCount()).isEqualTo(callsBefore));
    }

    @Test
    void restartRecoveryResumesALeftoverPendingItem() {
        ensureCallbackTargetConfigured();
        seedImportedProduct("partner-1", "pos-sku-0003", "9.00");

        String syncId = "sync_recovery_test";
        syncRedisStateStore.addPending(syncId, "pos-sku-0003");
        syncRedisStateStore.initItem(syncId, "pos-sku-0003", "partner-1");

        assertThat(syncRedisStateStore.findNonEmptyPendingSyncIds()).contains(syncId);

        syncRecoveryRunner.resumeLeftoverSyncs();

        await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> {
            var synced = syncedProductRepository.findByPartnerIdAndExternalId("partner-1", "pos-sku-0003");
            assertThat(synced).isPresent();
        });
        assertThat(syncRedisStateStore.getPending(syncId)).isEmpty();
    }

    private String seedImportedProduct(String partnerId, String externalId, String price) {
        ImportPayload payload = new ImportPayload(
                "SKU-" + externalId, "Test Product", new BigDecimal(price), "AED",
                new TaxAssignment("UAE VAT", new BigDecimal("5.00")));
        String hash = new com.example.bulkimport.service.HashService().hashPayload(payload);
        ImportedProduct product = new ImportedProduct(
                partnerId, externalId, payload, hash,
                SelectionStatus.NOT_SELECTED, ImportOutcome.NEW, 1, Instant.now(), Instant.now());
        importedProductRepository.save(product);
        return hash;
    }
}
