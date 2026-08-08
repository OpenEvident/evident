# Requirements

**Status:** Confirmed — informed the design decisions in [architecture.md](./architecture.md)
**Last updated:** 2026-08-08

---

## 1. Problem Statement

Features are increasingly implemented by AI coding agents across a Spring Boot
microservice architecture (REST APIs, Kafka events, MongoDB, Neo4j, AWS).
A single feature can span one service or many, and services interact through
several different mechanisms — direct calls, events, webhooks, callbacks, and
bulk/batch processing.

AI-written unit tests confirm code behaves correctly *in isolation*. They do
not confirm that a feature actually works *as a system*: that the right
services were called, the right data landed in the right stores, the right
events were processed, and nothing broke silently somewhere else in the flow.

We need a way for an AI agent to verify a feature end-to-end, across services,
using the same kind of evidence a human engineer would check by hand:
API responses, database state, and logs — for both services running locally
(uncommitted changes) and services already deployed to AWS.

---

## 2. Goals

- Let an AI agent (or a human, on demand) verify that a multi-service feature
  actually works, using real evidence — not just "unit tests passed."
- Cover the actual shapes of flows this system has: direct REST calls,
  service-to-service calls, Kafka-driven async processing, webhooks,
  callbacks, and bulk processing.
- Work against services in any mix of **local (uncommitted)** and
  **deployed (AWS)** state, within the same flow.
- Produce a **durable, reusable spec** per verified flow — a regression
  artifact, not a one-off check — so the same verification can be re-run
  later (by CI, by another agent, by a human) as the system evolves.
- Be usable from **any agentic coding tool** (Claude Code, Cursor,
  Antigravity, etc.), not locked to one vendor's agent runtime.

## 3. Non-Goals (for this version)

- **No direct Kafka inspection.** Services already log when they receive/
  process a Kafka event; verification relies on those logs, not on reading
  topics directly.
- **No architecture or technology decisions here.** This document defines
  *what* the system must do and support, not *how* it's built. See
  [architecture.md](./architecture.md) for the resolved design — MCP tool
  list, framework choice, spec file format, and everything else downstream
  of these requirements.
- **No mandated single way of doing anything** where real variation exists
  (see Core Principle below). This doc intentionally leaves several things
  as "must support multiple modes," not "must pick one."

---

## 4. Core Principle: Pluggable, Not Prescriptive

Nearly every dimension of this problem varies by flow, team, and service —
confirmed repeatedly during requirements discussion (spec location, spec
maintenance, trigger type, failure handling, safety level: all "it depends").

**Conclusion:** the framework must treat these as **per-flow configuration**,
not framework-wide constants. A design that hardcodes one answer (e.g. "specs
always live in a central repo") will not fit how this organization actually
works. Flexibility here is a requirement, not a deferred nice-to-have.

---

## 5. Functional Requirements

### 5.1 Flow Scope

- Must support a flow confined to a **single service**.
- Must support a flow spanning **multiple services**, connected via any
  combination of:
  - Direct/synchronous REST calls (service-to-service or client-to-service)
  - Asynchronous Kafka events (verified via consumer/producer logs)
  - Inbound webhooks / callbacks from external systems
  - Bulk/batch processing jobs

### 5.2 Environments

- Must support verifying a flow where all involved services are **local**
  (running uncommitted code on a developer machine).
- Must support verifying a flow where all involved services are **deployed**
  (AWS).
- Must support a **mixed** flow — some services local, some deployed —
  within a single verification run.

### 5.3 Evidence Sources

For a given flow, the framework must be able to gather and reason over:

| Evidence type | Local services | Deployed services |
|---|---|---|
| API responses | direct call | direct call |
| MongoDB state | direct query | direct query |
| Neo4j state | direct query | direct query |
| Logs (incl. Kafka event handling) | local file / stdout | CloudWatch |

### 5.4 Correlation Across Services

- Some services already propagate a shared correlation/trace ID across
  REST calls, Kafka messages, and logs. Some do not, and consistency
  cannot be assumed.
- The framework **must work even when no correlation ID exists**, using a
  fallback strategy (e.g. time-window plus payload/content matching) to
  associate evidence across services for a given flow execution.
- Where a correlation ID **does** exist, the framework should prefer it,
  since it's more reliable than heuristic matching.

### 5.5 Source of Expected Behavior ("what does correct look like")

Must support all of the following, without assuming one is always
available:

1. **Developer-stated** — a human explicitly describes expected outcomes.
2. **Agent-inferred** — the agent explores the relevant service code and
   derives expected behavior itself.
3. **Carried over from implementation** — the same agent that designed and
   built the end-to-end flow already knows what should happen, and uses
   that context directly rather than re-deriving it.

### 5.6 Triggering a Flow

Must support multiple trigger mechanisms, and remain extensible to new ones:

- Direct API calls (e.g. HTTP client hitting an endpoint)
- Playwright-driven UI interaction (for flows that start from a user action)
- Simulated external events (e.g. an inbound webhook call, a bulk file drop)
- (Explicitly expected: more trigger types will be needed later; the
  mechanism for adding one must not require redesigning the framework.)

### 5.7 Invocation Points

Verification must be runnable from all of the following contexts:

- **Self-check** — immediately after an AI agent implements a feature, as
  part of its own workflow.
- **On-demand** — a developer explicitly asks an agent to verify a flow at
  any point.
- **CI / PR gate** — automatically, before a pull request can merge.

And it must behave consistently regardless of **which agentic coding tool**
initiates it (Claude Code, Cursor, Antigravity, or others).

### 5.8 Side-Effect Safety

- Some flows are safe to trigger for real (isolated test environment).
- Some flows can hit real third parties or cause costly/irreversible actions
  (real outbound webhooks, real emails, real external API calls) if run
  against a shared or production-adjacent environment.
- There is **no global rule** that applies to all flows. Each flow must be
  able to declare its own safety posture, and the framework must respect it
  — e.g. run for real, ask a human first, or use a mock/stub instead.

### 5.9 Failure Handling

- When verification fails, the correct response is **not fixed** across all
  cases. The framework must support, per flow or per invocation:
  - **Report only** — return a pass/fail verdict with evidence; a human
    decides what to do.
  - **Fix and re-verify** — the agent attempts a correction and loops until
    it passes or gives up.
- Which mode applies must be decidable per context, not hardcoded.

### 5.10 Durability & Regression Reuse

- A verified flow must produce a **reusable spec** — not a throwaway,
  in-session-only result.
- The spec should be re-runnable later (by CI, by another agent, by a
  human) to catch regressions as the system evolves.
- **Spec location** must be flexible: standalone project, co-located inside
  the "owning" service's repo, duplicated across involved repos, or other —
  no single mandated layout, since repo structure across services is mixed
  (some shared, some separate).
- **Spec maintenance** must support multiple, coexisting mechanisms:
  - The agent that changes code updates any spec that references it, as
    part of the same change.
  - Specs are periodically re-run (e.g. in CI) and flagged when they no
    longer match reality (drift detection as a safety net).
  - Developers can manually review and edit specs directly.

---

## 6. Illustrative Example (for concreteness — not a design spec)

**Feature:** "Bulk import triggers downstream enrichment and a partner
webhook notification."

**Flow:**
1. Client calls `Ingestion Service` (REST, deployed) with a bulk file.
2. `Ingestion Service` writes raw records to MongoDB, then publishes one
   Kafka event per record.
3. `Enrichment Service` (running **locally**, uncommitted change under test)
   consumes those events, calls `Graph Service` to update relationships in
   Neo4j, and logs `"enriched record {id}"` on success.
4. Once enrichment completes, `Notification Service` (deployed) calls a
   partner's webhook URL and logs the outcome.

**What verification needs to do here, mapped to the requirements above:**
- Trigger: direct API call to `Ingestion Service` (5.6).
- Environment: mixed — deployed + local in the same run (5.2).
- Evidence: MongoDB write (Ingestion), local log line + Neo4j state
  (Enrichment, local), CloudWatch log for webhook call outcome
  (Notification, deployed) (5.3).
- Correlation: if `Ingestion Service` doesn't stamp a correlation ID on the
  Kafka event, evidence across the three services must still be associated
  via record ID + time window (5.4).
- Expected behavior: likely agent-inferred from the enrichment service's
  code, since this is the newly implemented piece (5.5).
- Safety: the partner webhook call is a real third-party side effect — this
  flow should probably declare "ask first" or "use a mock partner endpoint"
  rather than firing for real on every verification run (5.8).
- Durability: this becomes a reusable spec so that future changes to any of
  the three services can be regression-checked against the same flow (5.10).

---

## 7. Open Questions

One resolved, two still genuinely open:

1. ~~Audience for the verification report~~ — **resolved**: both. The run
   bundle (architecture.md §6) is structured for machine consumption and
   written to be legible to a human reviewer who opens it directly.
2. **Existing conventions to build on** — is there already a logging
   format/library standard, an existing AWS access pattern for read-only
   log/metric access, or existing integration test tooling in use that this
   should align with rather than duplicate? Still open.
3. **First pilot flow** — which *real* feature/flow (not the illustrative
   example in §6) should be the concrete V1 test case? Still open — needed
   before V1 implementation can start in earnest.
