# AI-Driven Multi-Service Verification Framework — Architecture

**Status:** V1 architecture resolved via design interview — implementation not yet started
**Last updated:** 2026-08-08
**Related docs:** [requirements](./requirements.md) · [prior art & research](./research.md) · [project setup](./project-setup.md)
**Diagram:** [visual walkthrough of the stack, run sequence, timeout model, and correlation modes](https://claude.ai/code/artifact/1fcc61d2-7011-4525-a88a-42c25b956292)

---

## 1. Guiding Principles

These fell out of the requirements and research phases and constrain every
decision below — worth stating explicitly since they're what should resolve
future disagreements without re-litigating them.

1. **Pluggable, not prescriptive.** Spec location, trigger type, safety
   level, failure handling, correlation mode — all per-flow configuration,
   never a single framework-wide constant. Confirmed repeatedly during
   requirements gathering that "it depends" was the honest answer almost
   every time.
2. **The framework is infrastructure, not intelligence.** No LLM calls, no
   agent loop, no orchestration harness inside the framework itself (CLI,
   evidence collectors, spec runner). It's a toolkit an agent *uses* — the
   same relationship Playwright has to whatever writes and runs its tests.
   All reasoning (what to test, whether a failure is real, whether an
   assertion is even meaningful) stays in the calling agent.
3. **Build independent, informed by prior art, not coupled to it.** Verified
   real prior art (Tracetest, Karate, WireMock, Awaitility) directly against
   source rather than guessing — but chose not to take a runtime dependency
   on any of it. Fast-moving landscape, no single project covers the full
   evidence surface we need (REST + Kafka-via-trace + Mongo + Neo4j + logs),
   and the closest match (Tracetest) has slowed down. Their design choices
   are references, not foundations.
4. **Reliability over cleverness, every time it's come up.** Explicit
   correlation fields over fuzzy auto-matching. Poll-by-default over
   single-shot assertions. Two-tier soft/hard timeouts over one blunt
   timeout. A slightly more verbose spec that's trustworthy beats a shorter
   one that's sometimes silently wrong.

---

## 2. Layered Architecture

```
 ┌─────────────────────────────────────────────────────────────┐
 │  AI Review Layer  (outside the framework)                    │
 │  Claude Code / other agents, via Skill + Hooks + CI            │
 │  — reads run bundles, judges quality, root-causes failures     │
 └───────────────────────────▲─────────────────────────────────┘
                              │ reads run bundles
 ┌─────────────────────────────────────────────────────────────┐
 │  Layer 5 — MCP Surface        (thin wrapper over Layers 1–4)  │
 ├─────────────────────────────────────────────────────────────┤
 │  Layer 4 — CLI / Runner       (deterministic, no LLM, no MCP) │
 ├─────────────────────────────────────────────────────────────┤
 │  Layer 3 — Evidence / Assertion Library  (poll(), waitFor…)   │
 ├─────────────────────────────────────────────────────────────┤
 │  Layer 2 — Spec Format        (defineFlow: metadata + run())  │
 ├─────────────────────────────────────────────────────────────┤
 │  Layer 1 — Configuration & Target Resolution (.env + config)  │
 └─────────────────────────────────────────────────────────────┘
```

The AI Review Layer is drawn outside the stack deliberately — it's a
consumer of what Layer 4 produces, not a component of the framework.
Nothing below it ever calls an LLM.

---

## 3. Layer 1 — Configuration & Target Resolution

Resolves, per service, where it currently is (local or deployed) and how to
reach it — base URL, log source, correlation mode.

```yaml
# evident.config.ts (executable, not static — needs env-var/branching logic)
defaultTarget: deployed

services:
  ingestion-service:
    deployed:
      baseUrl: https://staging.internal/ingestion
      logGroup: /ecs/staging/ingestion-service
      correlation: trace
    local:
      baseUrl: http://localhost:8081
      logPath: ./logs/ingestion-service.log
      correlation: trace   # per-service, can differ by environment too
```

- **Secrets split:** `evident.config.ts` (committed, structure only) +
  `.env`/`.env.example` (gitignored, real values) + `.env.local`
  (gitignored, per-developer overrides — ports, local paths). AWS access
  prefers a named profile (`AWS_PROFILE`) over static keys where possible.
  CI sources secrets from its own platform secret store, not a checked-in
  file — same `process.env` interface either way.
- **Per-run override:** `evident run <flow> --local enrichment-service`,
  mirroring `playwright test --project`.
- Decided against a centralized secrets manager (AWS Secrets Manager/SSM)
  for now — plain `.env` is enough at current scale; revisit if credential
  rotation across many repos becomes a real operational problem.

---

## 4. Layer 2 — Spec Format

A flow is a `defineFlow(...)` call: **static metadata** (must be readable
without executing anything, since safety-gating depends on it) plus an
**imperative `run()` body** (real TS, needed for bulk/conditional flows that
a static assertion list can't express).

```ts
export const flow = defineFlow({
  name: 'bulk-import-enrichment',
  services: ['ingestion-service', 'enrichment-service', 'notification-service'],
  safety: 'ask-first',        // static — CLI/MCP reads this before running anything
  correlation: 'trace',       // or 'heuristic', or per-service override
  async run({ trigger, evidence, poll }) {
    const res = await trigger.api('ingestion-service', { method: 'POST', path: '/import', body: file });

    for (const record of res.body.records) {
      await poll(async () => {
        const doc = await evidence.mongo('ingestion-service').findOne({ id: record.id });
        expect(doc?.status).toBe('imported');
      }, { expectBy: '2s', timeout: '15s' });

      await evidence.logs('enrichment-service').waitFor(`enriched record ${record.id}`, {
        matchOn: 'recordId', value: record.id,   // explicit correlation field — see §5
        expectBy: '2s', timeout: '15s',
      });
    }
  },
});
```

Why the split: safety level, involved services, and correlation mode must be
inspectable by the CLI/MCP layer *before* anything runs (e.g. to decide
"ask first" before a real webhook fires). Full imperative code can't be
statically inspected that way — so the two concerns live in different parts
of the same file rather than forcing one shape to do both jobs.

**Trigger mechanisms, per type — deliberately not all built on one library:**
- REST triggers (`trigger.api()`) — native `fetch` (Node 18+, zero deps), not
  Playwright. See Decision 14.
- UI-driven triggers — real Playwright browser automation (`playwright-core`
  only, never `@playwright/test` — that package brings its own competing
  test runner, which would undercut Decision 1). Not needed until a
  UI-triggered flow actually exists; zero Playwright dependency in V1.
- Kafka triggers — a Kafka client library (`kafkajs` or similar); Playwright
  has no Kafka support, so this is fully custom regardless.

General rule: reach for an existing library only for the mechanical,
well-solved piece (making an HTTP call, driving a browser). Assertions,
polling, evidence gathering, the spec format, and the CLI/runner stay ours —
those are where this framework's actual requirements live, and no existing
library shares them.

---

## 5. Layer 3 — Evidence & Assertion Library

**One generic polling primitive**, with per-source convenience methods as
thin sugar over it — not separate retry logic per evidence type.

```ts
// common case
await evidence.logs('enrichment-service').waitFor(pattern, { expectBy: '2s', timeout: '15s' });

// mixed sources / custom logic — same primitive underneath, using the standard
// `expect` matcher vocabulary for the comparison itself (see Decision 17)
await poll(async () => {
  const doc = await evidence.mongo('ingestion-service').findOne({ id });
  const logOk = await evidence.logs('enrichment-service').contains(`enriched record ${id}`);
  expect(doc?.status).toBe('enriched');
  expect(logOk).toBe(true);
}, { delay: '90s', expectBy: '2m', timeout: '5m' });
```

Three-way split, worth keeping distinct: **fetching evidence** (`evidence.mongo()`, `evidence.logs()`...) is ours, always domain-specific. **Retry/timing** (`poll()`, `expectBy`/`timeout`/`delay`) is ours, purpose-built for this framework's requirements. **Comparing a fetched value to what's expected** (`expect(...).toBe(...)`) is borrowed — mature, ubiquitous, not worth reinventing.

- **Poll-by-default**, not single-shot — async effects (Kafka, bulk jobs)
  are the common case, not the exception; a sync effect just passes on the
  first poll at negligible cost.
- **Two-tier timeout:** `expectBy` (soft — past this, flag as slow but keep
  going) and `timeout` (hard — past this, fail). Three outcomes per
  assertion: pass / pass-flagged-slow / fail. Framework-level defaults,
  overridable per call.
- **`delay`** — distinct from both: "don't even start polling yet," for
  flows with a known minimum realistic duration.
- **"Slow but passed" never blocks CI by default** — surfaced in the run
  bundle as a signal, not a gate. Configurable globally (`failOnSlow`) or
  per-flow for genuinely SLA-critical flows.

### Correlation mechanism

Per-service config field (§3): `correlation: trace | heuristic`.

- **`trace`** — the OpenTelemetry Java agent (`-javaagent:opentelemetry-javaagent.jar`,
  a JVM flag, zero application code change, works identically for an
  IntelliJ-launched local service or a deployed one) auto-instruments both
  REST and Kafka producer/consumer, propagating a W3C trace ID. Evidence
  collectors filter by that ID. Verified directly against
  `opentelemetry-java-instrumentation`'s supported-libraries list — not
  assumed.
- **`heuristic`** (fallback, for services not yet running the agent) — the
  spec **explicitly names the matching field(s) and value(s)**
  (`matchOn: [{ field: 'recordId', value: record.id }]`, all entries AND'd —
  a spec author can add more, e.g. an `eventType`, for stronger
  disambiguation), searched for within the active polling window.
  Deliberately **not** automatic fuzzy/timing-proximity matching — a
  false-positive correlation is worse than no correlation, and gets
  actively unreliable under concurrent real traffic.

  **Search algorithm:** bound every heuristic search to evidence timestamped
  at or after the moment the trigger actually fired (not when `run()`
  started). Within that window, matching runs an automatic three-rung
  ladder (Decision 25; researched against WireMock, Karate, Tracetest,
  Grafana, Datadog, and Spring Boot/OpenTelemetry's own docs — see
  `research/research-correlation-algorithm.md` and
  `research/research-correlation-modern-approaches.md`), strongest match
  wins, no spec-author configuration needed to pick a rung:

  1. **`substring`** — the raw log line contains `pattern` as literal text.
     Works against any log format, zero setup; the floor every service gets
     for free.
  2. **`structured-field`** — if a log line parses as JSON, every declared
     `matchOn` field is checked as an **exact key lookup** against the
     parsed object instead of falling back to substring on that line — a
     deterministic match rather than a hope that the value happens to
     render as matchable text. (Never silently falls back to substring
     on a JSON line whose fields don't match — that would reopen the exact
     false-positive risk `matchOn` exists to close.) Automatic the moment a
     service's logs are structured; see `examples/services/README.md`'s
     recipe (Spring Boot's native `logging.structured.format` + one
     `MDC.put`/`MDC.remove` pair at the request boundary — no new
     dependency).
  3. **`trace-id`** — a `structured-field` match whose line also carries a
     non-empty `trace_id` (e.g. because the OTel Java agent is attached for
     other reasons, or for `trace` mode elsewhere in the same fleet)
     upgrades to this strongest tier. Corroboration only — `trace_id`
     alone never causes a pass; the declared `matchOn` fields still have to
     match.

  Requiring the exact declared value(s) to appear (rather than a small int
  or generic value) narrows substring-collision risk precisely because it
  has no structural collision resistance to fall back on — unlike an OTel
  trace ID, which is a 128-bit random value where accidental collision
  within a bounded window is practically impossible (verified against the
  OTel trace API spec), a hand-picked `matchOn` value is only as safe as
  the identifier a spec author chose. For CloudWatch, the time-bound half
  of this is just how Logs Insights queries already work (every query is
  time-range-scoped), so it's not extra mechanism there, just how the
  query gets built.

  **Duplicate matches are a hard failure, not a soft risk.** `expectedMatches`
  defaults to exactly `1`; finding more within the window throws
  `DuplicateMatchError` immediately (not retried into a timeout — a
  duplicate is a fact about evidence that already exists, more polling
  can't undo it) as its own distinct failure kind from "0 matches / never
  happened." A spec author who knows duplicates are expected and benign
  (e.g. at-least-once delivery) can override with `expectedMatches: 'any'`.
  Only enforced when `matchOn` is declared — a bare substring `pattern` was
  never meant to identify a single record. No tool studied in the research
  (WireMock, Karate) does this automatically; it's Evident's own design,
  named as such rather than presented as a borrowed pattern.

  **The run bundle records which rung actually matched**
  (`AssertionRecord.matchedVia`) — a `substring` pass and a
  `structured-field` pass aren't equally trustworthy, and a teammate or
  agent debugging a flaky flow later has a concrete, actionable signal
  ("this service should turn on structured logging") that plain pass/fail
  can't give them.

  **Deferred, not built:** OTel Baggage as a carrier for business
  correlation values that propagate automatically across process
  boundaries (unlike MDC, which is per-process and needs re-stamping on
  every hop) — a real mechanism the research surfaced, but with no
  precedent anywhere endorsing or rejecting it for this use case, and no
  concrete multi-hop-async pain point yet to justify the extra surface.
  Revisit if/when a flow genuinely needs a correlation value to survive
  several hops without each service re-extracting it from its inbound
  payload.

---

## 6. Layer 4 — CLI / Runner

Deterministic execution — `evident run <flow>`. No LLM, no MCP dependency,
this is what CI/PR-gate calls directly. Every run, pass or fail, produces a
**run bundle**.

### Run bundle (not to be confused with "trace ID" — different concept, kept
deliberately distinct in naming)

A self-contained artifact per run (V1: written to local disk, e.g.
`.evident/runs/<runId>.json` — no live pointers back to services, so it's
still meaningful after the fact, to a different agent session, or handed to
a teammate):

- Flow metadata + which target each service actually used
- Trigger request/response
- Every assertion's selector/condition + result + timing vs. `expectBy`/`timeout`
- **Full raw evidence per service for the execution window** — not just
  matched snippets, so a reviewer (human or AI) can catch things no
  assertion specifically checked for
- The correlation key/value actually used

This is the mechanism that makes the AI Review Layer possible without
putting any intelligence inside the framework itself — same idea as
Playwright's Trace Viewer artifact, adapted to services instead of a
browser.

---

## 7. Layer 5 — MCP Surface

Thin wrapper over Layers 1–4, same underlying code path as the CLI — no
logic lives only here. Kept to a small, outcome-oriented tool set per
current MCP best practice (tool-selection accuracy measurably degrades well
before 30 tools): `resolveTarget`, `runFlow`, `getRunBundle`,
`getRawEvidence` (on-demand, not inlined — bounded context per call),
`scaffoldFlow`. Not yet fully specified — deferred past V1.

---

## 8. AI Review Layer (outside the framework)

Consumes the run bundle Layer 4 always produces. Never embedded in the
framework — implemented as a Claude Code **skill** (or equivalent for other
agents), wired into **hooks** (self-check after implementation) and **CI**
(headless invocation), matching the "zero human involvement" goal.

Two distinct jobs, both matter:
1. **Anomaly review** — scan the full raw evidence for warnings/errors
   beyond what any named assertion checked for.
2. **Test-quality review** — judge whether the assertions themselves were
   meaningful, catching false positives (a test that would pass even if the
   feature were broken).

**Circular-verification check (part of job 2):** flag any assertion whose
"expected" value was derived by re-running the same transformation logic
the flow itself exercises, then compared only against that flow's own
stored output. That proves the code did what the code does, not that the
code is correct. A meaningful assertion needs its expected value sourced
independently of the code path under test — the trigger's own input
payload, a fixed fixture value, or an external reference — never
re-derived from the system being verified. This is the specific failure
mode "test-quality review" exists to catch, not just a general reminder to
have assertions.

**Evidence is untrusted data, never instructions:** raw evidence (§6) can
contain arbitrary externally-influenced text — a webhook payload, an order
note, anything an external caller supplied to the service under test. When
the AI Review Layer's skill prompt includes it, that content must stay
clearly delimited as data and be explicitly marked as never-to-be-followed,
regardless of what it appears to say — the same instruction-source-boundary
principle that governs how any AI agent should treat tool results or file
contents it didn't author. A run bundle crafted (directly, or via a
compromised upstream service) to embed text shaped like a directive to the
reviewing agent is exactly the failure mode this guards against. This is a
requirement for however the skill/prompt ends up built, not optional
hardening to add after the fact.

**Invocation policy:** run bundle capture is always-on (free, deterministic).
AI review of it is conditional — always on failure (root-cause diagnosis is
exactly where it earns its keep), always in self-check/on-demand mode (agent
already live), configurable per flow/pipeline on passing CI runs (cost vs.
bug-leak-prevention tradeoff left to the team, not hardcoded).

---

## 9. V1 Scope

Deliberately narrow, per "small features first, expand based on need":

**In scope:** 2+ services, **local-only**, REST trigger + log evidence,
correlation mechanism (trace-ID + explicit-field heuristic fallback) proven
end-to-end, run bundle capture, CLI (`evident run`) — no MCP yet, run by hand.

**Explicitly deferred:** Mongo/Neo4j evidence, CloudWatch/deployed targets,
MCP surface, centralized run-bundle storage, WireMock-based outbound test
doubles, Testkube-style central visibility.

**Rationale:** multi-service correlation is the one mechanism that's
genuinely unproven and hardest to retrofit later. Prove it on the smallest
possible surface before investing in evidence-source breadth on top of a
foundation that might be wrong.

---

## 10. Decision Log

| # | Decision | Chosen | Rejected alternatives | Why |
|---|---|---|---|---|
| 1 | Dependency on Tracetest | Build independent | Compose as component; adopt wholesale | Only covers trace-assertion slice; project has slowed (verified: last commit ~14mo old); avoid coupling to any single fast-changing project |
| 2 | Correlation mechanism | Per-service: trace-ID (OTel agent) or explicit-field heuristic | Fuzzy auto-matching | False-positive correlation is worse than none; explicit is deterministic |
| 3 | Framework runtime | Node/TypeScript | Java/JVM | Matches Playwright ecosystem framing; keeps framework language-independent from services under test; MCP SDKs more mature |
| 4 | Spec file shape | Static metadata + imperative `run()` | Pure declarative; pure imperative | Safety-gating needs static readability; bulk flows need real control flow |
| 5 | Assertion polling | Poll-by-default | Single-shot, opt-in polling | Forgetting to poll an async effect produces flaky false failures |
| 6 | Timeout model | Two-tier (`expectBy` soft / `timeout` hard) | Single timeout | Separates correctness from performance; avoids punishing drift as a hard failure |
| 7 | "Slow" in CI | Never blocks by default, configurable | Always blocks | Avoids flakiness from perf noise; per-flow opt-in for SLA-critical cases |
| 8 | Mixed/custom evidence checks | One `poll()` primitive, per-source sugar on top | Separate retry logic per source | One mechanism to learn and trust; sugar doesn't fragment behavior |
| 9 | V1 scope | Multi-service, local-only, REST+logs | Single-service first; MCP-first | Proves the one genuinely unproven, hard-to-retrofit mechanism first |
| 10 | AI review placement | Outside framework (skill/hook/CI), reads run bundle | Embedded LLM calls inside CLI | Keeps CI runs fast/free/deterministic; intelligence stays with the calling agent |
| 11 | AI review invocation | Always on failure + self-check; configurable on passing CI | Always run every time | Cost control; failure/self-check is where it earns its keep |
| 12 | Run bundle content | Full raw evidence, not just matched snippets | Matched snippets only | Enables anomaly review and false-positive/weak-assertion detection |
| 13 | Run bundle storage (V1) | Local disk | Centralized store | V1 is local-only anyway; centralization is a fast-follow, not a blocker |
| 14 | HTTP trigger mechanism (`trigger.api()`) | Native `fetch` (Node 18+, zero deps) | Playwright's `request` context; axios | Playwright's package pulls down real browser binaries on install — unnecessary weight for a pure HTTP call. Playwright stays reserved for actual UI-driven triggers only, where it's the right and largely uncontested choice. Net effect: V1 needs zero Playwright dependency. |
| 15 | `ask-first` enforcement | `evident run` refuses unless `--confirm` is passed | Interactive CLI prompt | No LLM/agent lives inside the CLI to "ask" anyone (Principle 2) — `--confirm` makes the caller (human or agent) responsible for having already decided |
| 16 | CI exit contract | Exit 0 only if all assertions passed (slow-but-passed still 0, per Decision 7); exit 1 on any failure; run bundle path always printed to stdout | — | Standard Unix convention; lets CI/the AI-review skill find the bundle without extra plumbing |
| 17 | Assertion comparison syntax | Standalone `expect` package (the one Jest/Playwright are both built on) used *inside* `poll()` | Playwright's own auto-retrying `expect(locator)...`; a custom-built comparison DSL | `expect`'s matcher vocabulary (`.toBe`, `.toEqual`, `.toContain`...) is mature, ubiquitous, and already fluent to any AI/developer — reinventing comparison syntax would be pure duplication. Playwright's *auto-retrying* variant doesn't transfer: it's DOM-locator-specific and has one timeout, not our two-tier model — `poll()` still owns all retry/timing semantics, `expect` only supplies the comparison. |
| 18 | Heuristic correlation search algorithm | Bound search to evidence timestamped ≥ trigger-fire time, require exact declared value match | Automatic fuzzy/timing-proximity matching | Kills stale-match false positives from append-only local logs outright; narrows (not eliminates) substring-collision risk. Maps directly onto how CloudWatch Logs Insights queries already work (time-range-scoped by nature). |
| 19 | Trigger call retry | No auto-retry by default; opt-in per trigger call (`idempotent: true, retries: n`) | Auto-retry always; never retryable at all | Many trigger endpoints are non-idempotent (create a job, submit a payment) — silent auto-retry risks a real duplicate side effect. Failure is reported distinctly as "trigger failure" vs. "assertion failure" in the run bundle. |
| 20 | Repo layout | One repo (this one), split internally: `/framework` (library source — what eventually gets open-sourced) vs. `/examples` (V1 proof-of-concept flow specs, private) | Framework embedded inside a service repo; specs and framework mixed with no boundary | Specs are company-specific and can't ship with an open-sourced framework; keeping the boundary clean from day one makes a later split mechanical instead of a rewrite. `git init` done, `.gitignore` excludes `research/` (third-party reference clones — must never enter this repo's history), `.env`/`.env.local`, and `.evident/` (local run bundles). |
| 21 | Spec file naming/organization | `*.flow.ts` suffix (glob-discovered, recursive); directory structure fully unrestricted, no recommended convention even as a loose default | Mandated folder structure (by service/domain); safety level or other metadata encoded into filename | A multi-service flow doesn't cleanly belong to one folder — matches Guiding Principle 1 (pluggable, not prescriptive). Encoding metadata in filenames would create a second source of truth alongside the static metadata block (Decision 4), able to drift out of sync. |
| 22 | Run bundle format versioning | Stamp `schemaVersion` into every bundle from day one; defer all migration/compatibility handling | No versioning; full migration tooling now | Adding a version field retroactively is impossible for bundles already written; adding it now costs nothing. Migration logic has no V1 justification yet. |
| 23 | AI Review Layer evidence handling | Raw evidence treated as untrusted data — explicitly delimited and marked non-instructional in the reviewing prompt | Trusting evidence content at face value | A run bundle can contain arbitrary externally-influenced text (webhook payloads, user-submitted fields); an AI Review Layer that doesn't treat it as data risks indirect prompt injection — same principle as not following instructions found in tool results. |
| 24 | `.evident/runs/` retention | Time-based (default 14 days), configurable via `EvidentConfig.runRetentionDays` + `--retention-days` CLI override (same precedence as `--target`/`defaultTarget`), disableable, auto-pruned silently on every `evident run`, plus a separate `evident clean` command for manual clearing | Count-based cap (e.g. "keep last N bundles"); Playwright's model (wipe the whole output dir at the start of every run) | A count cap doesn't scale with project size — a bundle is written per Flow, not per invocation, so a project with 100 flows run in one CI invocation could exhaust a flat cap mid-run and delete bundles from the run still in progress. Playwright's wipe-on-every-run model was rejected because Evident's bundles are explicitly designed to be handed to another agent session or a teammate (unlike Playwright's ephemeral traces/screenshots) — losing all history after the very next run doesn't fit that goal. |
| 25 | Heuristic correlation matching implementation | Composite `matchOn` (array of `{field, value}`, all AND'd); automatic 3-rung ladder (substring → JSON exact-field lookup → `trace_id` corroboration), strongest match wins, no spec-author config to pick a rung; `matchedVia` recorded in the bundle; `expectedMatches` defaults to `1`, throws `DuplicateMatchError` immediately (not retried) when matchOn is declared and exceeded | Single-field `matchOn` only; always-substring search; silent first-match-wins on duplicates; requiring structured JSON logging globally | Researched against real prior art first (`research/research-correlation-algorithm.md`, `research/research-correlation-modern-approaches.md`) — WireMock's own docs treat composite AND-matching as the default shape, not an advanced option; Spring Boot's native structured logging + one MDC call closes the "does this field reliably appear" gap other platforms (Datadog, Grafana) also solve via structured fields, not magic matching; no tool studied does automatic duplicate handling, so treating 2+ matches as a hard, distinct failure is original design, named as such. Kept the zero-config substring floor always available rather than requiring the upgrade globally — mirrors OTel's own agent-vs-manual-instrumentation two-tier framing. |

---

## 11. Open Branches (not yet resolved)

- OTel Baggage as a carrier for business correlation values that need to
  survive multiple process hops without each service re-extracting them
  from its inbound payload (Decision 25's matching ladder solves
  single-hop reliability via MDC; Baggage is a different, unadopted
  mechanism for the multi-hop case — see
  `research/research-correlation-modern-approaches.md` §5, open question 3)
- Cross-heterogeneous-store heuristic search (matching one `matchOn` value
  across a log file *and* a Mongo query *and* a Neo4j query in one check)
  has no prior art anywhere studied — flagged now so it isn't assumed to be
  a simple extension of the log-only case whenever Mongo/Neo4j evidence
  (§9, explicitly deferred) actually gets built
- CLI command surface beyond `evident run`
- MCP tool list, finalized (§7 names are provisional)
- Repo/package layout and distribution (`@org/evident`?)
- Spec file naming/organization conventions
- Trigger retry/idempotency semantics (what happens if the trigger call itself fails or times out)
- Run bundle format versioning (so old bundles stay readable as the framework evolves)
- Trust-on-first-use allow-list for `evident run`'s dynamic import of flow/
  config files — a `direnv allow`-style mechanism (content-hash a file,
  refuse to import it until explicitly trusted, re-prompt if it changes)
  would give real protection instead of the current `--help` note, which
  only informs a human reader and blocks nothing. Deferred, not built:
  current exposure is close to zero pre-release, and the CLI-interaction
  story (how does an untrusted-by-default check work in CI, where there's
  no interactive step to run `evident allow` first?) isn't resolved yet —
  building it before that's answered risks the wrong mechanism. The
  `--help` note is a stopgap for the interim, not the resolved answer.
- WireMock adoption specifics for outbound test doubles
- Rollout plan for attaching the OTel agent across existing services
- Requirement-to-Flow generation — a future layer that drafts a starting
  `defineFlow` spec from a ticket/PRD, entirely above the framework (AI
  Review Layer territory, same "outside, never embedded" rule as Decision
  10) — deliberately not designed until V1 proves the execution mechanism
  it would be generating specs *for*
