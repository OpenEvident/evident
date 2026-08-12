package com.example.bulkimport.integration;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URL;
import java.net.HttpURLConnection;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * A minimal stand-in for menu-service's reference-data lookup and bulk
 * product endpoints, used only by bulk-import-service's own integration
 * tests — real menu-service is built separately (see
 * {@code examples/services/menu-service}). Built on the JDK's built-in
 * {@code com.sun.net.httpserver.HttpServer} so no new test dependency is
 * needed. Callbacks are fired back to bulk-import-service's own running
 * instance, exactly like the real menu-service would.
 */
class FakeMenuService {

    private final HttpServer server;
    private final Map<String, String> currenciesByCode = new ConcurrentHashMap<>();
    private final Map<String, String> taxesByNameAndPercentage = new ConcurrentHashMap<>();
    private final AtomicInteger taxIdSequence = new AtomicInteger(1);
    private final AtomicInteger productIdSequence = new AtomicInteger(1);
    private final List<String> bulkDispatchRequestBodies = new CopyOnWriteArrayList<>();
    private volatile int callbackTargetPort;

    FakeMenuService() {
        try {
            this.server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
        server.createContext("/currencies", this::handleCurrencies);
        server.createContext("/taxes", this::handleTaxes);
        server.createContext("/products/bulk", this::handleProductsBulk);
        server.start();
    }

    void seedCurrency(String code, String currencyId, int precision) {
        currenciesByCode.put(code, """
                {"id":"%s","code":"%s","name":"%s","precision":%d,"status":"ACTIVE"}
                """.formatted(currencyId, code, code, precision));
    }

    void seedTax(String name, String percentage, String taxId) {
        taxesByNameAndPercentage.put(taxKey(name, percentage), """
                {"id":"%s","name":"%s","percentage":%s,"countryId":null,"status":"ACTIVE","version":1}
                """.formatted(taxId, name, percentage));
    }

    void setCallbackTargetPort(int port) {
        this.callbackTargetPort = port;
    }

    int bulkDispatchCallCount() {
        return bulkDispatchRequestBodies.size();
    }

    List<String> bulkDispatchRequestBodies() {
        return bulkDispatchRequestBodies;
    }

    String baseUrl() {
        return "http://localhost:" + server.getAddress().getPort();
    }

    void stop() {
        server.stop(0);
    }

    private void handleCurrencies(HttpExchange exchange) throws IOException {
        String query = exchange.getRequestURI().getQuery();
        String code = queryParam(query, "code");
        String found = currenciesByCode.get(code);
        respond(exchange, 200, found == null ? "[]" : "[" + found + "]");
    }

    private void handleTaxes(HttpExchange exchange) throws IOException {
        if ("GET".equals(exchange.getRequestMethod())) {
            String query = exchange.getRequestURI().getQuery();
            String name = queryParam(query, "name");
            String percentage = queryParam(query, "percentage");
            String found = taxesByNameAndPercentage.get(taxKey(name, percentage));
            respond(exchange, 200, found == null ? "[]" : "[" + found + "]");
            return;
        }
        // POST /taxes — find-or-create path
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        String name = extractJsonString(body, "name");
        String percentage = extractJsonNumber(body, "percentage");
        String taxId = "tax_created_" + taxIdSequence.getAndIncrement();
        String created = """
                {"id":"%s","name":"%s","percentage":%s,"countryId":null,"status":"ACTIVE","version":1}
                """.formatted(taxId, name, percentage);
        taxesByNameAndPercentage.put(taxKey(name, percentage), created);
        respond(exchange, 201, created);
    }

    private void handleProductsBulk(HttpExchange exchange) throws IOException {
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        bulkDispatchRequestBodies.add(body);

        String syncId = extractJsonString(body, "syncId");
        String batchId = "batch_" + System.nanoTime();
        List<String> externalIds = extractExternalIds(body);

        respond(exchange, 202, """
                {"batchId":"%s","jobCount":%d}
                """.formatted(batchId, externalIds.size()));

        // Fire the per-item callback asynchronously, like a real async batch processor would.
        new Thread(() -> {
            for (String externalId : externalIds) {
                String productId = "prod_" + productIdSequence.getAndIncrement();
                fireCallback(syncId, externalId, productId);
            }
        }).start();
    }

    private void fireCallback(String syncId, String externalId, String productId) {
        try {
            String callbackBody = """
                    {"syncId":"%s","productId":"%s","status":"SYNCED"}
                    """.formatted(syncId, productId);
            byte[] bytes = callbackBody.getBytes(StandardCharsets.UTF_8);

            URL url = URI.create("http://localhost:" + callbackTargetPort
                    + "/imports/products/" + externalId + "/sync-result").toURL();
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("POST");
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setDoOutput(true);
            try (OutputStream os = connection.getOutputStream()) {
                os.write(bytes);
            }
            connection.getResponseCode();
            connection.disconnect();
        } catch (Exception e) {
            throw new IllegalStateException("failed to fire sync-result callback", e);
        }
    }

    private List<String> extractExternalIds(String bulkRequestBody) {
        Matcher matcher = Pattern.compile("\"externalId\"\\s*:\\s*\"([^\"]+)\"").matcher(bulkRequestBody);
        List<String> ids = new java.util.ArrayList<>();
        while (matcher.find()) {
            ids.add(matcher.group(1));
        }
        return ids;
    }

    private String extractJsonString(String json, String field) {
        Matcher matcher = Pattern.compile("\"" + field + "\"\\s*:\\s*\"([^\"]*)\"").matcher(json);
        return matcher.find() ? matcher.group(1) : null;
    }

    private String extractJsonNumber(String json, String field) {
        Matcher matcher = Pattern.compile("\"" + field + "\"\\s*:\\s*([0-9.]+)").matcher(json);
        return matcher.find() ? matcher.group(1) : null;
    }

    private String taxKey(String name, String percentage) {
        return name + ":" + new java.math.BigDecimal(percentage).stripTrailingZeros().toPlainString();
    }

    private String queryParam(String query, String key) {
        if (query == null) {
            return null;
        }
        for (String pair : query.split("&")) {
            String[] parts = pair.split("=", 2);
            if (parts.length == 2 && parts[0].equals(key)) {
                return java.net.URLDecoder.decode(parts[1], StandardCharsets.UTF_8);
            }
        }
        return null;
    }

    private void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}
