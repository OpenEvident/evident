package com.example.publishing.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.example.publishing.repository.MaterializedViewRepository;
import com.example.publishing.web.dto.MaterializedViewResponseDto;
import com.example.publishing.web.dto.PublishAcceptedResponseDto;
import com.example.publishing.web.dto.PublishCategoryDto;
import com.example.publishing.web.dto.PublishPriceDto;
import com.example.publishing.web.dto.PublishProductDto;
import com.example.publishing.web.dto.PublishRequestDto;
import com.example.publishing.web.dto.PublishTaxDto;
import java.math.BigDecimal;
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
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

/**
 * Exercises the real validate → materialize → callback pipeline end to end
 * against real Mongo — both the success path and the validation-failure
 * path (Walkthrough-equivalent: {@code menu.published} must never appear
 * for a menu that failed validation).
 */
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
class PublishingIntegrationTest {

    @TestConfiguration
    static class TestRestTemplateConfig {
        @Bean
        RestTemplateBuilder restTemplateBuilder() {
            return new RestTemplateBuilder().requestFactory(SimpleClientHttpRequestFactory::new);
        }
    }

    @Container
    static MongoDBContainer mongo = new MongoDBContainer(DockerImageName.parse("mongo:7.0"));

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
        registry.add("menu-service.base-url", () -> fakeMenuService.baseUrl());
    }

    @LocalServerPort
    private int localPort;

    @Autowired
    private TestRestTemplate restTemplate;
    @Autowired
    private MaterializedViewRepository materializedViewRepository;

    @org.junit.jupiter.api.BeforeEach
    void cleanState() {
        materializedViewRepository.deleteAll();
    }

    @Test
    void validPublishMaterializesAndCallsBackPublished() {
        int callbacksBefore = fakeMenuService.publishResultCallbacks().size();

        PublishTaxDto tax = new PublishTaxDto("tax_vat_ae_001", "UAE VAT", new BigDecimal("5.00"), "cty_ae_001", "ACTIVE");
        PublishPriceDto price = new PublishPriceDto("cur_aed_001", 1300, false, List.of());
        PublishProductDto product = new PublishProductDto("prod_1", "SKU-1", "Cheeseburger", List.of(price));
        PublishCategoryDto category = new PublishCategoryDto("cat_1", "Burgers", List.of(), List.of(product));
        PublishRequestDto request = new PublishRequestDto(
                "menu_publish_test", "Summer Menu", "cty_ae_001", "cur_aed_001", 2,
                List.of("tax_vat_ae_001"), true, List.of(category), List.of(tax));

        PublishAcceptedResponseDto accepted = restTemplate.postForObject(
                "http://localhost:" + localPort + "/publish", request, PublishAcceptedResponseDto.class);
        assertThat(accepted.status()).isEqualTo("VALIDATING");

        await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> {
            assertThat(fakeMenuService.publishResultCallbacks().size()).isGreaterThan(callbacksBefore);
            String lastCallback = fakeMenuService.publishResultCallbacks()
                    .get(fakeMenuService.publishResultCallbacks().size() - 1);
            assertThat(lastCallback).contains("PUBLISHED");

            MaterializedViewResponseDto view = restTemplate.getForObject(
                    "http://localhost:" + localPort + "/materialized-views/menu_publish_test", MaterializedViewResponseDto.class);
            assertThat(view.products()).hasSize(1);
            assertThat(view.products().get(0).unitPrice()).isEqualTo(1300);
            assertThat(view.products().get(0).taxAmount()).isEqualTo(65);
        });
    }

    @Test
    void invalidPublishNeverMaterializesAndCallsBackValidationFailed() {
        int callbacksBefore = fakeMenuService.publishResultCallbacks().size();

        // price leg currency doesn't match the menu's currency -> Phase 1 must fail
        PublishPriceDto price = new PublishPriceDto("cur_usd_001", 1000, false, List.of());
        PublishProductDto product = new PublishProductDto("prod_2", "SKU-2", "Fries", List.of(price));
        PublishCategoryDto category = new PublishCategoryDto("cat_1", "Sides", List.of(), List.of(product));
        PublishRequestDto request = new PublishRequestDto(
                "menu_invalid_test", "Broken Menu", "cty_ae_001", "cur_aed_001", 2,
                List.of(), false, List.of(category), List.of());

        restTemplate.postForObject("http://localhost:" + localPort + "/publish", request, PublishAcceptedResponseDto.class);

        await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> {
            assertThat(fakeMenuService.publishResultCallbacks().size()).isGreaterThan(callbacksBefore);
            String lastCallback = fakeMenuService.publishResultCallbacks()
                    .get(fakeMenuService.publishResultCallbacks().size() - 1);
            assertThat(lastCallback).contains("VALIDATION_FAILED");
        });

        assertThat(materializedViewRepository.findByMenuId("menu_invalid_test")).isEmpty();
    }
}
