# Example services

Three Spring Boot services that exist to be verified *against* — not part
of the published framework (`/framework`), not part of any real product.
They're the "system under test" the flow specs in `/examples/flows` point
at, built to exercise Evident's correlation mechanism under realistic
conditions: bulk payloads, real async batch processing that **survives a
mid-batch service restart**, hash-based change detection with **two
separate hash checks**, an external-ID mapping layer, full CRUD on owned
resources, and an **explicit**, separately-triggered publish step with a
real validate/materialize split.

The shape is loosely inspired by real production e-commerce/catalogue
platforms — an original, simplified design, not a port of any specific
system. Together the three model a realistic flow: import raw partner
product data in bulk, sync selected items into a menu catalogue, assemble
a menu from existing products, and explicitly publish it with tax
calculation.

Spring Boot 4.1.0, Java 17, Maven, real MongoDB and Redis (via
docker-compose).

## Quick start

```bash
# 1. Start MongoDB + Redis
cd examples/services && docker compose up -d

# 2. Start all three services, in this order (menu-service seeds its own
#    reference data on startup, so it must be up before bulk-import-service
#    triggers anything) — one per terminal:
cd publishing-service && mvn spring-boot:run
cd menu-service && mvn spring-boot:run
cd bulk-import-service && mvn spring-boot:run
```

Ports: `bulk-import-service` 8083, `menu-service` 8084, `publishing-service`
8085. Full step-by-step curl walkthrough (import → sync → assemble menu →
publish → read the result) in [End-to-end walkthrough](#end-to-end-walkthrough)
below; endpoint-by-endpoint reference in the per-service sections; test
instructions in [Testing](#testing).

**On Windows, run everything (`mvn spring-boot:run`, `mvn test`) from
PowerShell or cmd.exe, not Git Bash** — a real embedded server (or
anything using `java.net.http.HttpClient`) launched from Git Bash/MSYS2
hits an NIO selector bug on some machines (`Unable to establish loopback
connection`) that doesn't occur from a native Windows shell.

## What Evident can actually verify here

Evident's evidence surface today is **REST trigger response + log
evidence only** (`docs/architecture.md` §9). MongoDB and Redis are real,
used for real persistence/coordination — but Evident never queries them
directly. Anything a flow spec asserts on must show up as a structured
log line. All three services log via `StructuredLog`, a small per-service
helper that stamps a fixed field set into SLF4J's MDC for one log line
then removes it, backed by Spring Boot's native structured JSON logging
(`logging.structured.format.file: ecs` in each `application.yml`). Every
event named below resolves via the `structured-field` correlation rung
(`docs/architecture.md` §5) out of the box — no extra setup.

---

## Architecture overview

```
POST /imports (N items, raw codes/names, no real IDs) ─┐
                                                          │ Workflow 1: Import
                                                          │ hash-classify →
                                                          │ NEW/UPDATED/UNCHANGED
                                                          ▼
                                     ┌───────────────────────────┐
                                     │   bulk-import-service      │  Mongo: imported_products,
                                     │   (port 8083)              │  import_requests, synced_products
                                     │                            │  Redis: sync workflow state,
                                     │                            │  ref-data cache (from menu-service)
                                     └──────────┬─────────────────┘
                                                 │ Workflow 2: Sync — resolve
                                                 │ currencyCode→id, tax name+%→id
                                                 │ (find-or-create), then check the
                                                 │ SECOND hash (synced_products) —
                                                 │ skip dispatch if unchanged since
                                                 │ last successful sync
                                                 ▼
                                     ┌─────────────────────┐
                                     │  bulk-import-service │──POST /products/bulk (CREATE/UPDATE,
                                     │  (resolved dispatch) │   batch, real IDs only)──────────┐
                                     └─────────────────────┘                                    ▼
                                                 ▲                       ┌─────────────────────────┐
                                                 │  callback, incl.       │      menu-service         │
                                                 │  productId              │      (port 8084)          │
                                                 └─────────────────────── │  Mongo: countries,        │
                                                   sync-result             │  currencies, taxes (CRUD),│
                                                                           │  products (standalone),   │
                                                                           │  menus (categories embed  │
                                                                           │  productIds — manual CRUD)│
                                                                           │  Redis: batch pending-set,│
                                                                           │  survives restart         │
                                                                           └──────────┬────────────────┘
                                                                                       │ (separate, manual)
                                                                                       │ operator attaches
                                                                                       │ existing productIds
                                                                                       │ into menu categories
                                                                                       │
                                                                                       │ (separate, EXPLICIT)
                                                                                       │ POST /menus/{id}/publish
                                                                                       ▼
                                                                           ┌─────────────────────┐
                                                                           │  publishing-service  │
                                                                           │  (port 8085)         │
                                                                           │  no reference data — │
                                                                           │  pure validate +     │
                                                                           │  materialize on      │
                                                                           │  already-resolved    │
                                                                           │  input               │
                                                                           │  Mongo: materialized_ │
                                                                           │  views               │
                                                                           └─────────────────────┘
```

Three genuinely separate actions, each independently triggerable: **sync a
product's data** (bulk-import-service's job), **assemble a menu from
existing products** (a human, via menu-service CRUD — never automatic),
and **publish a menu** (an explicit call, never automatic).

---

## `bulk-import-service` (port 8083)

Owns the canonical current state of every imported product, the history
of every import call, the externalId↔productId mapping, and two named,
Redis-backed, restart-resilient workflows — **Import** and **Sync**.
Never creates or references a Menu.

**`POST /imports`** — hash-compares each item against `imported_products`,
classifies `NEW`/`UPDATED`/`UNCHANGED`, upserts the canonical record,
writes one `import_requests` audit doc. If an item comes back `UPDATED`
and is already `selectionStatus: SELECTED`, immediately kicks off Sync for
that item — no human re-selection.

```jsonc
// request
{
  "partnerId": "partner-1",
  "items": [
    { "externalId": "pos-sku-0001", "sku": "SKU-0001", "name": "Cheeseburger",
      "price": 13.00, "currencyCode": "AED",
      "taxAssignment": { "name": "UAE VAT", "percentage": 5.00 } }
  ]
}
// response 202
{ "requestId": "req_d4e5f6", "itemCount": 1, "summary": { "new": 1, "updated": 0, "unchanged": 0 }, "autoSyncTriggered": [] }
```

Log: `{"requestId":"...","externalId":"pos-sku-0001","outcome":"NEW","event":"item.imported"}`

**`POST /sync`** — resolves each item's raw `currencyCode`/`taxAssignment`
against menu-service (Redis-cached, TTL ~1h; tax resolution is
find-or-create), then checks the **second** hash (`synced_products`) —
skips dispatch entirely if unchanged since the last successful sync, even
on an explicitly re-triggered call. Everything that still needs dispatch
batches into one `menu-service` `POST /products/bulk` call.

```jsonc
// request
{ "partnerId": "partner-1", "externalIds": ["pos-sku-0001"] }
// response 202
{ "syncId": "sync_x9y8z7", "selectedCount": 1 }
```

Logs: `item.sync.skipped` (no-op, unchanged since last sync — proves a
negative, `menu-service` never gets called for that item),
`item.sync.dispatched`, `item.sync.completed`, `item.sync.failed`.

Redis-backed per-item state machine
(`RESOLVING_REFS → CHECKING_SYNC_HASH → DISPATCHING → AWAITING_RESULT →
DONE|SKIPPED|FAILED`) survives a restart — on `ApplicationReadyEvent`,
any non-empty leftover `sync:{syncId}:pending` set is resumed from
wherever its own per-item state left off (`sync.recovery.resumed`).

**`POST /imports/products/{externalId}/sync-result`** — the callback
`menu-service` uses to report a dispatched item's real `productId` back;
this is what actually advances an item to `DONE`, not a poll.

**Read-only**: `GET /imports/products` (filterable by `partnerId` and
`selectionStatus`), `GET /imports/products/{externalId}`,
`GET /imports/requests/{requestId}`.

---

## `menu-service` (port 8084)

Owns Country/Currency/Tax reference data (full CRUD, seeded on startup),
standalone Products, and Menus (categories embed product references,
never the other way around) — menu assembly is entirely manual CRUD,
never triggered by a sync.

**Reference data** — `POST`/`GET`/`PUT`/`DELETE` on `/countries`,
`/currencies`, `/taxes` (soft-deleted, not removed). `GET
/currencies?code=AED` and `GET /taxes?name=X&percentage=Y` specifically
support bulk-import-service's resolve step. Seeded idempotently on every
startup: countries `AE`/`SA`/`GB`, currencies `AED`/`SAR`/`GBP`/`USD` (2dp
each), taxes UAE VAT 5% (`AE`), KSA VAT 15% (`SA`), UK VAT 20% (`GB`),
Service Tax 2% (global).

**`POST /products/bulk`** — the async, restart-resilient dispatch target
called only by bulk-import-service's Sync workflow. Each item already
carries resolved real IDs (currency, tax) and an explicit `CREATE`/
`UPDATE` action; batch outcome is `PROCESSING` → `COMPLETED` or
`PARTIALLY_COMPLETED` (per-item success/failure, not all-or-nothing).
Survives a mid-batch restart — `ApplicationReadyEvent` scans
`batch:*:pending` and resumes exactly the members still left
(`batch.recovery.resumed`). An `UPDATE` (or a product `DELETE`)
reverse-looks-up any `PUBLISHED` menu referencing that product and flags
it `UPDATES_AVAILABLE` — never auto-republished.

```jsonc
// request (partnerId/syncId carried through opaquely from bulk-import-service)
{
  "partnerId": "partner-1", "syncId": "sync_x9y8z7",
  "items": [
    { "externalId": "pos-sku-0001", "action": "CREATE", "sku": "SKU-0001", "name": "Cheeseburger",
      "prices": [ { "currencyId": "cur_...", "amount": 1300, "taxInclusive": false, "taxIds": ["tax_..."] } ] }
  ]
}
// response 202
{ "batchId": "batch_m4n5o6", "jobCount": 1 }
```

Logs: `product.saved`, `menu.updates_available`.
`GET /bulk/{batchId}/status` — read-only batch progress (never consulted
by the workflow itself; the per-item callback to bulk-import-service is
authoritative).

**Product/Menu CRUD** — `POST`/`GET`/`PUT`/`DELETE /products/{productId}`
(soft delete), `POST`/`GET`/`PUT`/`DELETE /menus/{menuId}`, `GET
/menus?partnerId=...&status=...`.

**`POST /menus/{menuId}/categories/{categoryId}/products`** — the actual
menu-assembly action, attaching one or more already-existing product IDs
to a category. Deliberate, manual, never automatic.

```jsonc
// request
{ "productIds": ["prod_9f8e7d"] }
```

Log: `menu.products_attached`.

**`POST /menus/{menuId}/publish`** — the **explicit** publish trigger,
never auto-fired. Resolves the full menu (categories + referenced
products + every referenced tax, fully expanded) and calls
publishing-service's `POST /publish`. Marks the menu `PUBLISHING`
immediately.

Log: `menu.publish.triggered`.

**`POST /menus/{menuId}/publish-result`** — the callback publishing-service
uses to report the real outcome once it finishes validating/materializing
(publishing-service's own `POST /publish` is itself async — 202
immediately). Applies `PUBLISHED` or `VALIDATION_FAILED` to the menu.

---

## `publishing-service` (port 8085)

Owns nothing but the materialized-view output — no reference data, no
products, no menus. Pure validate + calculate on whatever already-resolved
payload menu-service hands it.

**`POST /publish`** — called only by menu-service. Response `202
Accepted` (`{menuId, status: "VALIDATING"}`); runs async, then calls back
menu-service with the real outcome.

- **Phase 1 — Validate**: currency-leg-exists, `name`/`sku` non-empty,
  every referenced tax marked `ACTIVE`. Collects every error; any failure
  fails the whole menu, never reaches Phase 2. Log: `menu.validation_failed`.
- **Phase 2 — Materialize**: resolves tax by priority — price leg's own
  `taxIds` → else category's → else, if `applyMenuLevelTax`, the menu's →
  else none. First non-empty level wins outright, never merged with
  another. A tax scoped to a different country than the menu's is
  silently excluded from the sum (not a hard failure). Sums, then applies
  respecting `taxInclusive` (integer minor units, rounded to the
  currency's precision, `HALF_UP`):
  - exclusive: `unitPrice = amount`; `taxAmount = round(unitPrice × rate)`; `priceInclTax = unitPrice + taxAmount`
  - inclusive: `priceInclTax = amount`; `unitPrice = round(amount / (1 + rate))`; `taxAmount = priceInclTax − unitPrice`

  Worked example — 1300 (13.00 AED), exclusive, 5% VAT: `unitPrice: 1300,
  taxAmount: 65, priceInclTax: 1365`. Log: `menu.published`.

**`GET /materialized-views/{menuId}`** — read the generated view.

```jsonc
{
  "menuId": "menu_p1q2r3", "name": "Summer Menu",
  "products": [
    { "productId": "prod_9f8e7d", "sku": "SKU-0001", "name": "Cheeseburger",
      "unitPrice": 1300, "taxAmount": 65, "priceInclTax": 1365,
      "appliedTaxes": [ { "taxId": "tax_...", "name": "UAE VAT", "percentage": 5.00 } ],
      "taxSourceLevel": "PRODUCT" }
  ],
  "publishedAt": "2026-08-12T09:00:07Z"
}
```

---

## End-to-end walkthrough

See [Quick start](#quick-start) above to get all three services running
first. Each service writes its own log file to `logs/<service-name>.log`
(relative to that service's directory), in addition to console output —
this is the evidence source the framework's `evidence.logs()` collector
reads.

```bash
# 1. Import a product
curl -X POST http://localhost:8083/imports -H "Content-Type: application/json" -d '{
  "partnerId": "partner-1",
  "items": [{ "externalId": "pos-sku-0001", "sku": "SKU-0001", "name": "Cheeseburger",
    "price": 13.00, "currencyCode": "AED", "taxAssignment": { "name": "UAE VAT", "percentage": 5.00 } }]
}'

# 2. Sync it — resolves currency/tax against menu-service, dispatches, creates the product
curl -X POST http://localhost:8083/sync -H "Content-Type: application/json" -d '{
  "partnerId": "partner-1", "externalIds": ["pos-sku-0001"]
}'

# 3. Find the real currency/country IDs menu-service seeded, and the new productId
curl http://localhost:8084/currencies
curl http://localhost:8084/countries
curl "http://localhost:8084/products?status=ACTIVE"

# 4. Create a menu and manually assemble it (use the real IDs from step 3)
curl -X POST http://localhost:8084/menus -H "Content-Type: application/json" -d '{
  "partnerId": "partner-1", "name": "Summer Menu", "countryId": "<cty_id>", "currencyId": "<cur_id>",
  "taxIds": [], "applyMenuLevelTax": true, "categories": [{ "name": "Burgers", "taxIds": [] }]
}'
curl -X POST http://localhost:8084/menus/<menuId>/categories/<categoryId>/products \
  -H "Content-Type: application/json" -d '{ "productIds": ["<productId>"] }'

# 5. Publish explicitly
curl -X POST http://localhost:8084/menus/<menuId>/publish

# 6. Read the materialized view
curl http://localhost:8085/materialized-views/<menuId>
```

## Testing

Each service has unit tests (business logic — hash classification, tax
resolution algorithm, cascade rules), `@WebMvcTest` controller tests, and
a Testcontainers integration test (real MongoDB + Redis, real HTTP calls
end to end, including restart-recovery scenarios) — 63 tests total, all
passing. Run per service:

```bash
cd <service> && mvn test
```

**On Windows, run `mvn test` from PowerShell or cmd.exe, not Git Bash** —
the integration tests boot a real embedded server, which hits the same
NIO selector issue noted above.
