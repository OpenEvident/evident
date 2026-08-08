# Prior Art & Research Findings

**Status:** Complete — findings below informed [architecture.md](./architecture.md); see its Decision Log (§10) for what was ultimately decided and why
**Last updated:** 2026-08-08

> Repos cloned and read directly for this research: `kubeshop/tracetest`,
> `karatelabs/karate`, `wiremock/wiremock-webhooks-extension` — see
> `research/` in this project. Claims below marked "verified" were confirmed
> against actual source/examples in these clones or primary vendor docs, not
> secondary summaries.

Purpose: before designing this framework, establish what already exists, what's
genuinely reusable, and where the real gap is — so the architecture builds on
proven patterns instead of reinventing solved problems.

---

## 1. Directly relevant prior art

### Tracetest (kubeshop/tracetest) — closest conceptual match
Open-source, OpenTelemetry-based **trace-based testing**. A test = a **trigger**
(HTTP, gRPC, or an existing trace ID) + **assertions against trace/span data**
using selectors (e.g. `span[tracetest.span.type="database"]` with a duration
check). Explicitly supports asserting on **async side effects** — message
queues, async API calls, external calls — not just the synchronous response.
Ships as YAML test definitions, a CLI for CI/GitOps, cloud and self-hosted
modes.

**Why it matters:** this is the same shape as what we need — trigger +
cross-system assertions on a distributed flow, durable and CI-runnable. Malabi
(aspecto-io) is a smaller sibling project doing the same thing for JS
services.

**Verified directly from source** (cloned `kubeshop/tracetest`):

- **It already handles almost exactly our Kafka scenario.** The
  `examples/tracetesting-event-driven-systems` example is a REST call →
  Kafka topic → two independent consumers (one Go, one **plain Java**,
  no Spring) → DB writes, with a real test asserting all the way through:
  "message published" → "Go consumer received it" → "Java consumer received
  it" → "risk analysis flagged it correctly" → "order was persisted." This is
  materially the same shape as the bulk-import example we sketched earlier.
- **Specs can be authored as code, not just YAML** —
  `examples/quick-start-typescript/definitions.ts` defines tests as plain
  TypeScript objects via the `@tracetest/client` package. Confirms your
  instinct from earlier: anything expressible as code is AI-authorable the
  same way a Playwright spec is; the trace-vs-log question doesn't change
  that.
- **Playwright is a first-class native trigger type, not just "inspired
  by."** `docs/docs/concepts/triggers.mdx` lists supported trigger types as
  `http|grpc|kafka|traceid|cypress|playwright|k6|artillery`, including
  "Playwright Engine - Run Playwright tests natively in Tracetest." There's
  also a **native Kafka trigger** (`type: kafka`) that publishes a message
  directly, for testing consumers in isolation without going through a REST
  entry point.
- **Real limitation, confirmed by reading every assertion in these
  examples:** every assertion is against **span data** — e.g.
  `db.repository.operation = "create"`, `attr:db.result = 1` — captured from
  auto-instrumented DB client spans. There is no mechanism to independently
  query actual Mongo/Neo4j state after the fact; you're asserting "a DB
  operation with these characteristics happened," not "the document now
  looks like X." For our requirement (real Mongo/Neo4j state assertions),
  Tracetest would need to be paired with a separate DB-query assertion
  layer, not replace one.
- **Kafka correlation requires zero application code**, confirmed against
  the primary OpenTelemetry source
  (`opentelemetry-java-instrumentation/docs/supported-libraries.md`):
  "Apache Kafka Producer/Consumer API" (0.11+) is an officially
  auto-instrumented library. Attaching
  `-javaagent:opentelemetry-javaagent.jar` as a JVM argument — which works
  identically whether the service is launched from IntelliJ, a terminal, or
  Docker — auto-generates and propagates trace context through Kafka message
  headers with **no Spring dependency and no code changes**. This is a
  broader and simpler mechanism than the Micrometer-Tracing-specific claim
  in an earlier draft of this document (see correction below).

### Karate DSL
Single plain-English/Gherkin-like syntax across REST, GraphQL, SOAP, gRPC,
with **built-in assertions, mocking, and perf testing in one tool** — no
separate client/assertion/mock libraries to glue together. Relevant as a
readability reference for the assertion library (Layer 3), not as something
to adopt wholesale.

**Verified directly from source** (cloned `karatelabs/karate`): confirmed the
DSL is exactly as terse as advertised — e.g. a full scenario is `* url
'http://localhost:9000/cats'` / `* method get`. Readable, but this
terseness comes from Karate owning the entire execution model; it's a good
ergonomics reference, not a library you'd embed inside something else.

### Pact (contract testing)
A different, complementary paradigm: pairwise **consumer/provider contracts**
verified independently, not a full multi-service flow. Answers "can I deploy
this without breaking a consumer," not "does this end-to-end flow work."
Worth considering later as a separate, lighter-weight practice — not a
replacement for flow verification, and out of scope for this design.

### Cucumber + Testcontainers + embedded Kafka (Spring ecosystem)
A common existing pattern: Given-When-Then specs, an embedded Kafka broker
via Testcontainers, step definitions in Java, all within **one repo**. Good
precedent for spec readability; does not address cross-repo, cross-environment
(local+deployed), or cross-store (Mongo+Neo4j+logs) verification — it solves
a narrower, single-service-repo version of this problem.

### Testkube (kubeshop)
Test **orchestration**, not a test framework itself: a Control Plane (trigger/
manage/report) plus Agents deployed wherever tests need to run, runs any
existing tool (Postman, Cypress, JMeter, etc.), single pane of glass across
CI systems. Useful architectural reference for a future "central reporting,
distributed execution" model — not needed for v1 given the immediate scale,
but the Control Plane / Agent split is a clean pattern if this ever needs to
run across many developer machines with central visibility.

### WireMock (+ webhooks extension)
Purpose-built for exactly the "test apps standing in for real third parties"
requirement: stands up a fake HTTP service, can itself fire outbound
webhooks/callbacks in response to a matched request, records real traffic to
generate stubs, simulates errors/latency. This is almost certainly the
concrete mechanism behind "we won't make real outbound calls."

**Verified directly from source** (cloned `wiremock/wiremock-webhooks-extension`):
`WebhooksAcceptanceTest.java` shows the real, simple shape — a `Webhooks`
extension is registered on the mock server (`.extensions(webhooks)`), a
`webhook(...)` builder is attached to a stub, and when that stub is matched,
WireMock fires the configured callback to a separate target server
asynchronously. Confirmed as a small, self-contained mechanism, not a heavy
dependency.

### Awaitility (Java)
The standard library for **polling-until-true with timeout**, used for
eventual-consistency assertions (write, then poll a read model until it
reflects the write, rather than a fixed sleep). This is exactly the semantics
Layer 3 (evidence/assertion library) needs for async Kafka-driven effects —
and it's a pattern your engineers likely already use in existing Java tests,
so mirroring its API shape (not necessarily the library itself, since our
evidence layer is likely Node/TS-based per the Playwright-style CLI) keeps
things familiar.

---

## 2. Adjacent, but a different problem

Several 2026 tools (**AgentAssay**, **agentevals**, **OpenHands**'s test
framework, **Langfuse**) do "trace-based testing" for **AI agents themselves**
— evaluating whether an LLM agent's own reasoning/tool-call trajectory is
correct, replaying recorded traces instead of re-running expensive LLM calls.
That's a genuinely different target: they verify **agent behavior**, we need
to verify **microservice business-flow behavior that an agent happened to
implement**. Not reusable directly, but the "record once, evaluate many
times without replay cost" idea is worth carrying over conceptually for how
durable specs get re-run in CI.

Microsoft's own `code-testing-generator` (July 2026, via GitHub Copilot CLI)
explicitly **excludes integration, E2E, browser, and performance tests**,
generating unit tests only. Even a major vendor's newest tool in this space
stops exactly where our problem starts.

**Conclusion: the specific combination we need — AI-authored, durable,
multi-service, mixed local/deployed, cross-store (REST+Mongo+Neo4j+logs)
verification — does not exist as an off-the-shelf open-source project.**
That's a genuine gap, and validates that building (and potentially
open-sourcing) this has real value rather than reinventing a solved wheel.

---

## 3. A finding that should change the correlation strategy

Originally scoped correlation as "some services have a trace ID, some don't,
so we need a robust heuristic fallback (time-window + payload matching) as
the primary mechanism." Research changes this recommendation — and an
earlier draft of this section overstated a Spring-specific mechanism before
it had been verified. Corrected version, verified against primary sources:

- **The OpenTelemetry Java auto-instrumentation agent — not a Spring/
  Micrometer-specific mechanism — auto-instruments Kafka producer/consumer
  (0.11+), confirmed directly against
  `opentelemetry-java-instrumentation/docs/supported-libraries.md`.**
  Attaching `-javaagent:opentelemetry-javaagent.jar` as a JVM argument
  generates and propagates W3C trace context through Kafka message headers
  automatically — **no code changes, no Spring dependency required.** This
  works identically for a service launched from IntelliJ (add the flag to
  the run configuration's JVM args), a terminal, or a container, which
  matters directly for the "how do we handle IntelliJ-launched local
  services" question from earlier.
- **AWS itself recommends OpenTelemetry (via ADOT)** as the modern
  instrumentation path for CloudWatch/X-Ray, specifically because it gives
  correlated logs+traces — best practice is embedding the trace ID in
  structured log lines so CloudWatch/ServiceLens can jump from a trace to its
  logs directly.
- **Tracetest's own event-driven example proves this works end-to-end in
  practice**, not just in theory: a Go producer and a plain (non-Spring)
  Java consumer, connected only by the OTel agent's automatic Kafka
  instrumentation, produce a single correlated trace that Tracetest asserts
  against across both services.

**Implication:** the same standardization effort (attaching the OTel Java
agent — a JVM flag, not a code change) would very likely solve **both** the
local Kafka-correlation problem **and** the deployed CloudWatch-correlation
problem at once, and is a smaller lift than previously described (no
dependency changes, no Spring requirement, just a launch-time flag). That
reframes the heuristic time-window/payload-matching fallback from "the core
mechanism" to "a bridge for the (hopefully few) services where attaching the
agent isn't straightforward" — worth deciding explicitly in the design
session whether this is in scope now.

---

## 4. Constraints on the MCP layer (Layer 5), from current best practice

- **Tool granularity:** one tool per user intent, not one per underlying API
  call. Both extremes are anti-patterns — "god tools" that take a free-form
  params blob and dispatch internally, and "micro-tools" that force several
  round-trips for one request.
- **Tool count budget is real:** tool-selection accuracy measurably drops
  as the tool count grows — even strong models degrade somewhere past
  ~20-30 tools, weaker ones much sooner. The MCP surface needs to be a small,
  curated set (e.g. resolve-target, run-flow, get-evidence, scaffold-flow),
  not one tool per evidence source × environment combination.
- **Resources should be bounded context, not raw dumps** — a "give me the
  full log file" tool is the wrong shape; results should be pre-filtered/
  summarized to what's decision-relevant.

This directly constrains how Layer 5 should be designed and is worth holding
as a hard constraint in the design session, not an aspiration.

---

## 5. What happened to the open questions this research raised

This research originally closed with four open items. Rather than maintain a
second, drifting copy of "what's still open" alongside architecture.md, here's
where each one landed — architecture.md's own Open Branches (§11) is the
single current list going forward:

- **Build on Tracetest vs. independently** — resolved. Architecture.md
  Decision 1: build independent. Tracetest only covers the trace-assertion
  slice; the project has also slowed (last commit ~14 months old at time of
  research).
- **Tracing-standardization scope** — resolved. Decision 2/18: per-service
  configurable (trace-ID where attached, explicit-field heuristic
  elsewhere), not an all-or-nothing rollout decision.
- **WireMock adoption specifics** — still open. Carried into
  architecture.md §11.
- **Testkube's Control Plane/Agent split** — still open, not needed for V1.
  Carried into architecture.md §11.
