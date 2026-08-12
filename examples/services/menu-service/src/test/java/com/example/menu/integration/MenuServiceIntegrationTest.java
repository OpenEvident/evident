package com.example.menu.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.example.menu.domain.Menu;
import com.example.menu.domain.MenuStatus;
import com.example.menu.domain.Product;
import com.example.menu.domain.ProductStatus;
import com.example.menu.redis.BatchRedisStateStore;
import com.example.menu.repository.MenuRepository;
import com.example.menu.repository.ProductRepository;
import com.example.menu.service.BatchRecoveryRunner;
import com.example.menu.web.dto.BulkProductItemRequestDto;
import com.example.menu.web.dto.BulkProductRequestDto;
import com.example.menu.web.dto.BulkProductResponseDto;
import com.example.menu.web.dto.BulkStatusResponseDto;
import com.example.menu.web.dto.MenuRequestDto;
import com.example.menu.web.dto.MenuResponseDto;
import com.example.menu.web.dto.ProductPriceDto;
import java.time.Duration;
import java.util.List;
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
 * Exercises the bulk product pipeline (dispatch, cascade-to-stale,
 * restart recovery) and the explicit publish trigger end to end against
 * real Mongo and real Redis. Both bulk-import-service (the sync-result
 * callback target) and publishing-service (the publish target and
 * publish-result caller) are stood in for by {@link FakeUpstreamServices}
 * — this suite's job is menu-service's own workflow, not theirs.
 */
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
class MenuServiceIntegrationTest {

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

    static FakeUpstreamServices fakeUpstream;

    @BeforeAll
    static void startFakeUpstream() {
        fakeUpstream = new FakeUpstreamServices();
    }

    @AfterAll
    static void stopFakeUpstream() {
        fakeUpstream.stop();
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.data.mongodb.uri", mongo::getReplicaSetUrl);
        registry.add("spring.data.redis.host", redis::getHost);
        registry.add("spring.data.redis.port", () -> redis.getMappedPort(6379));
        registry.add("bulk-import-service.base-url", () -> fakeUpstream.baseUrl());
        registry.add("publishing-service.base-url", () -> fakeUpstream.baseUrl());
    }

    @LocalServerPort
    private int localPort;

    @Autowired
    private TestRestTemplate restTemplate;
    @Autowired
    private ProductRepository productRepository;
    @Autowired
    private MenuRepository menuRepository;
    @Autowired
    private BatchRedisStateStore batchRedisStateStore;
    @Autowired
    private BatchRecoveryRunner batchRecoveryRunner;
    @Autowired
    private org.springframework.data.redis.core.StringRedisTemplate stringRedisTemplate;
    @Autowired
    private com.example.menu.repository.CountryRepository countryRepository;
    @Autowired
    private com.example.menu.repository.CurrencyRepository currencyRepository;

    private boolean upstreamConfigured = false;

    private void ensureUpstreamConfigured() {
        if (!upstreamConfigured) {
            fakeUpstream.setMenuServicePort(localPort);
            upstreamConfigured = true;
        }
    }

    @org.junit.jupiter.api.BeforeEach
    void cleanState() {
        productRepository.deleteAll();
        menuRepository.deleteAll();
        stringRedisTemplate.execute((org.springframework.data.redis.connection.RedisConnection connection) -> {
            connection.serverCommands().flushDb();
            return null;
        });
    }

    @Test
    void bulkCreateCompletesAndCallsBackBulkImportService() {
        ensureUpstreamConfigured();
        int callbacksBefore = fakeUpstream.syncResultCallbacks().size();

        BulkProductRequestDto request = new BulkProductRequestDto("partner-1", "sync_x9y8z7", List.of(
                new BulkProductItemRequestDto("pos-sku-0001", "CREATE", "SKU-0001", "Cheeseburger",
                        List.of(new ProductPriceDto("cur_aed_001", 1300, false, List.of("tax_vat_ae_001"))))));

        BulkProductResponseDto response = restTemplate.postForObject(
                "http://localhost:" + localPort + "/products/bulk", request, BulkProductResponseDto.class);
        assertThat(response.batchId()).isNotBlank();

        await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> {
            BulkStatusResponseDto status = restTemplate.getForObject(
                    "http://localhost:" + localPort + "/bulk/" + response.batchId() + "/status", BulkStatusResponseDto.class);
            assertThat(status.status()).isEqualTo("COMPLETED");
            assertThat(fakeUpstream.syncResultCallbacks().size()).isGreaterThan(callbacksBefore);

            List<Product> products = productRepository.findByStatus(ProductStatus.ACTIVE);
            assertThat(products).anyMatch(p -> "pos-sku-0001".equals(p.getExternalId()));
        });
    }

    @Test
    void bulkUpdateFlagsAPublishedReferencingMenuStale() {
        ensureUpstreamConfigured();

        Product existing = productRepository.save(new Product(
                "prod_stale_test", "pos-sku-0002", "SKU-0002", "Old Name",
                List.of(new com.example.menu.domain.ProductPrice("cur_aed_001", 1000, false, List.of())),
                ProductStatus.ACTIVE, 1, java.time.Instant.now(), java.time.Instant.now()));

        com.example.menu.domain.Category category = new com.example.menu.domain.Category(
                "cat_1", "Cat", List.of(), List.of(existing.getProductId()));
        Menu publishedMenu = menuRepository.save(new Menu(
                "menu_stale_test", "partner-1", "Menu", "cty_ae_001", "cur_aed_001", List.of(), false,
                List.of(category), MenuStatus.PUBLISHED, 1, java.time.Instant.now(), java.time.Instant.now()));

        BulkProductRequestDto request = new BulkProductRequestDto("partner-1", "sync_update_test", List.of(
                new BulkProductItemRequestDto("pos-sku-0002", "UPDATE", "SKU-0002", "New Name",
                        List.of(new ProductPriceDto("cur_aed_001", 1500, false, List.of())))));

        restTemplate.postForObject(
                "http://localhost:" + localPort + "/products/bulk", request, BulkProductResponseDto.class);

        await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> {
            Menu reloaded = menuRepository.findByMenuId("menu_stale_test").orElseThrow();
            assertThat(reloaded.getStatus()).isEqualTo(MenuStatus.UPDATES_AVAILABLE);
        });
    }

    @Test
    void restartRecoveryResumesALeftoverPendingBatchItem() {
        ensureUpstreamConfigured();

        String batchId = "batch_recovery_test";
        String itemJson = """
                {"partnerId":"partner-1","syncId":"sync_recovery_test","item":
                  {"externalId":"pos-sku-0003","action":"CREATE","sku":"SKU-0003","name":"Recovered Item",
                   "prices":[{"currencyId":"cur_aed_001","amount":900,"taxInclusive":false,"taxIds":[]}]}}
                """;
        batchRedisStateStore.initBatch(batchId, 1);
        batchRedisStateStore.addPending(batchId, "pos-sku-0003", itemJson);

        assertThat(batchRedisStateStore.findNonEmptyPendingBatchIds()).contains(batchId);

        batchRecoveryRunner.resumeLeftoverBatches();

        await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> {
            assertThat(productRepository.findByExternalId("pos-sku-0003")).isPresent();
        });
        assertThat(batchRedisStateStore.getPending(batchId)).isEmpty();
    }

    @Test
    void publishTriggerSendsAResolvedPayloadAndAppliesTheCallbackOutcome() {
        ensureUpstreamConfigured();
        fakeUpstream.setNextPublishOutcome("PUBLISHED");

        // ReferenceDataSeeder generates real random IDs at startup — the literal
        // "cty_ae_001"/"cur_aed_001" style strings used elsewhere in this suite are
        // illustrative only and never actually exist in a live database. The publish
        // path is the one flow that genuinely dereferences these IDs, so this test
        // must look up the real seeded ones by their natural code instead.
        String realCountryId = countryRepository.findByCode("AE").orElseThrow().getId();
        String realCurrencyId = currencyRepository.findByCode("AED").orElseThrow().getId();

        MenuRequestDto createRequest = new MenuRequestDto(
                "partner-1", "Summer Menu", realCountryId, realCurrencyId, List.of(), true,
                List.of(new com.example.menu.web.dto.CategoryRequestDto("Burgers", List.of())));
        MenuResponseDto created = restTemplate.postForObject(
                "http://localhost:" + localPort + "/menus", createRequest, MenuResponseDto.class);

        int publishRequestsBefore = fakeUpstream.publishRequests().size();

        restTemplate.postForObject(
                "http://localhost:" + localPort + "/menus/" + created.menuId() + "/publish", null, Object.class);

        await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> {
            assertThat(fakeUpstream.publishRequests().size()).isGreaterThan(publishRequestsBefore);
            Menu reloaded = menuRepository.findByMenuId(created.menuId()).orElseThrow();
            assertThat(reloaded.getStatus()).isEqualTo(MenuStatus.PUBLISHED);
            assertThat(reloaded.getPublishedAt()).isNotNull();
        });
    }
}
