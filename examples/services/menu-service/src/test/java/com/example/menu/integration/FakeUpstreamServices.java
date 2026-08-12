package com.example.menu.integration;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Stands in for both bulk-import-service (the sync-result callback
 * receiver) and publishing-service (the {@code /publish} endpoint that
 * calls back {@code /menus/{menuId}/publish-result}), so menu-service's
 * own integration tests can exercise both outbound boundaries without
 * running two other real services. Built on the JDK's built-in
 * {@code com.sun.net.httpserver.HttpServer} — no new test dependency.
 */
class FakeUpstreamServices {

    private final HttpServer server;
    private final List<String> syncResultCallbacks = new CopyOnWriteArrayList<>();
    private final List<String> publishRequests = new CopyOnWriteArrayList<>();
    private volatile int menuServicePort;
    private volatile String nextPublishOutcome = "PUBLISHED";

    FakeUpstreamServices() {
        try {
            this.server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
        server.createContext("/imports/products/", this::handleSyncResult);
        server.createContext("/publish", this::handlePublish);
        server.start();
    }

    void setMenuServicePort(int port) {
        this.menuServicePort = port;
    }

    void setNextPublishOutcome(String outcome) {
        this.nextPublishOutcome = outcome;
    }

    List<String> syncResultCallbacks() {
        return syncResultCallbacks;
    }

    List<String> publishRequests() {
        return publishRequests;
    }

    String baseUrl() {
        return "http://localhost:" + server.getAddress().getPort();
    }

    void stop() {
        server.stop(0);
    }

    private void handleSyncResult(HttpExchange exchange) throws IOException {
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        syncResultCallbacks.add(body);
        respond(exchange, 200, "{}");
    }

    private void handlePublish(HttpExchange exchange) throws IOException {
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        publishRequests.add(body);
        respond(exchange, 202, "{}");

        String menuId = extractJsonString(body, "menuId");
        String outcome = nextPublishOutcome;
        new Thread(() -> fireCallback(menuId, outcome)).start();
    }

    private void fireCallback(String menuId, String status) {
        try {
            String callbackBody = "{\"status\":\"" + status + "\",\"errors\":null}";
            byte[] bytes = callbackBody.getBytes(StandardCharsets.UTF_8);
            URL url = URI.create("http://localhost:" + menuServicePort + "/menus/" + menuId + "/publish-result").toURL();
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
            throw new IllegalStateException("failed to fire publish-result callback", e);
        }
    }

    private String extractJsonString(String json, String field) {
        Matcher matcher = Pattern.compile("\"" + field + "\"\\s*:\\s*\"([^\"]*)\"").matcher(json);
        return matcher.find() ? matcher.group(1) : null;
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
