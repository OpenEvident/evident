package com.example.publishing.integration;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Stands in for menu-service's {@code POST /menus/{menuId}/publish-result}
 * callback receiver — publishing-service's own integration tests only need
 * to prove publishing-service's workflow, not menu-service's.
 */
class FakeMenuService {

    private final HttpServer server;
    private final List<String> publishResultCallbacks = new CopyOnWriteArrayList<>();

    FakeMenuService() {
        try {
            this.server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
        server.createContext("/menus/", this::handlePublishResult);
        server.start();
    }

    List<String> publishResultCallbacks() {
        return publishResultCallbacks;
    }

    String baseUrl() {
        return "http://localhost:" + server.getAddress().getPort();
    }

    void stop() {
        server.stop(0);
    }

    private void handlePublishResult(HttpExchange exchange) throws IOException {
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        publishResultCallbacks.add(body);
        byte[] bytes = "{}".getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(200, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}
