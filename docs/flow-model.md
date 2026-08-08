# Flow Model — Suites, Hooks, Fixtures, and Execution

**Status:** Draft — every Playwright claim below verified directly against
Playwright's own source and documentation, not assumed from memory
**Last updated:** 2026-08-09
**Related docs:** [architecture.md](./architecture.md) · [examples/flows/README.md](../examples/flows/README.md)

## 1. Why this doc exists

Playwright's test model is the product of years of real-world refinement —
worth building on deliberately where our problem is the same shape, and
diverging deliberately (not accidentally) where multi-service verification
is genuinely different. This doc names every concept explicitly, states
what's borrowed vs. adapted vs. new, and flags what's still undecided.

---

## 2. Concept glossary

| Category | Term | What it is | Relationship to Playwright |
|---|---|---|---|
| Spec authoring | **Flow** | One verified end-to-end scenario | Equivalent of `test()` |
| | **Flow Suite** | A file grouping related Flows | Equivalent of a `describe()` block/spec file |
| | `defineFlow` | Declares a Flow: static metadata + imperative body | No equivalent — Playwright's `test()` has no static-metadata concept |
| Lifecycle | **Hook** (`beforeAll`/`beforeEach`/`afterEach`/`afterAll`) | Setup/teardown around Flows in a Suite | Same names, same semantics, deliberately |
| | **Fixture** | Composable, scoped setup+teardown, injected on demand | Same concept — see §5 |
| Execution | **Sequential mode** | Flows in a Suite run in declared order | Playwright's default single-file behavior |
| | **Parallel mode** | Flows in a Suite run concurrently | `test.describe.configure({ mode: 'parallel' })` |
| | **Serial mode** | Flows run in order, can share state, one failure skips the rest | `test.describe.configure({ mode: 'serial' })` |
| | **Lock** | Named lock preventing specific Flows from running concurrently, even across Suites | Playwright's `{ lock: 'name' }` |
| Triggering & evidence | Trigger, Evidence, `poll()`, `expect`, correlation, etc. | — | Already covered in architecture.md — no Playwright equivalent for most of these |

---

## 3. Flow Suites

A `.flow.ts` file exporting one or more named Flows (already adopted in
`examples/flows/` — see `timeout.flow.ts`, `safety.flow.ts`). No mandated
directory structure (Decision 21 still holds) — grouping into files is a
convention we're choosing, informed by how a real Playwright API-testing
project shapes its `tests/` folder, not something the framework enforces.

---

## 4. Hooks

`beforeAll` / `beforeEach` / `afterEach` / `afterAll`, scoped to a Flow
Suite — same names as Playwright, on purpose, for zero relearning cost.

- `beforeEach`/`afterEach` run before/after **every Flow** in the Suite.
- `beforeAll`/`afterAll` run **once** for the whole Suite.

Straightforward to adopt. The more interesting question is when to reach
for these vs. a Fixture instead — see below.

---

## 5. Fixtures — the more powerful mechanism

Verified directly from Playwright's own fixtures documentation: fixtures
aren't just "reusable setup," they're positioned as the *preferred*
mechanism over raw hooks specifically because they:

- **Pair setup and teardown in one place** — one function, split by a
  single `await use(value)` call: code before is setup, code after is
  teardown. Playwright's own guidance: *"if you have an after hook that
  tears down what was created in a before hook, consider turning them into
  a fixture."*
- **Are reusable** across files (import the same fixture everywhere).
- **Are on-demand/lazy** — only set up if a Flow actually asks for them.
- **Are composable** — a fixture can depend on other fixtures.
- **Support automatic fixtures** (`{ auto: true }`) — run for every Flow
  even without being explicitly requested, for cross-cutting concerns.
- **Support scoping** — Playwright has `'test'` (fresh per test) and
  `'worker'` (shared across a whole worker process) scopes.

### What this means for Evident specifically

Our `clients/caller-service.ts` / `clients/receiver-service.ts` (from
`examples/flows/`) are currently **plain functions** — not scoped, not
composable, no paired teardown, nothing automatic. Given Playwright's own
framing, formalizing these into real Fixtures is the more correct long-term
shape, not just a style choice.

**This also directly answers the "one flow creates, one flow updates" question
from before.** Rather than reaching for closures-over-shared-variables in a
serial Suite as the primary mechanism, the more Playwright-aligned answer is:
a **Suite-scoped Fixture** creates the resource (setup), makes it available
to every Flow in the Suite that requests it, and deletes it afterward
(teardown) — Flows that need ordering still use serial mode *together with*
the fixture, matching Playwright's own example (which combines
`beforeAll`/`afterAll` + serial mode for exactly this shape).

### Scope naming — a real difference worth deciding, not copying blindly

Playwright's `'worker'` scope means "shared across all tests in one OS
worker process" — a concept tied to how Playwright parallelizes across real
processes with isolated browser instances. Evident has no browser and no
inherent need for OS-process-level isolation between Flows. Copying the
word `'worker'` here would import a concept that doesn't actually apply.
**Open decision:** Evident's fixture scopes are probably `'flow'` (fresh
per Flow, equivalent to Playwright's `'test'`) and `'suite'` (shared across
a Flow Suite, equivalent in *effect* to Playwright's `'worker'` scope for
our purposes, without borrowing a name that implies OS-process semantics we
don't have).

---

## 6. Execution model: sequential vs. parallel

Adopting the same three modes, config-controlled per Suite:

- **Sequential (default)** — Flows in a Suite run in declared order.
- **Parallel (opt-in)** — Flows in a Suite run concurrently.
- **Serial (opt-in)** — Flows run in order, may share Suite-scoped Fixture
  state, and a failure skips the remaining Flows in the group. Matching
  Playwright's own stance: *"Using serial is not recommended. It is usually
  better to make your tests isolated."* — an escape hatch for genuine
  dependencies, not the default posture.

### A real difference from Playwright, worth stating plainly

Playwright's parallel Flows are safe by default because each gets an
**isolated browser context** — separate cookies, storage, in-memory state.
Evident's Flows have no equivalent isolation: they call **real, possibly
shared external services**. Two Flows racing to create/modify the same
record is a real collision risk in our world in a way it structurally isn't
in Playwright's. Playwright's own mitigation — *derive a unique identifier
per test so parallel runs never collide* — is something our flows already
do (every flow generates its own `recordId` from `Date.now()`), which
turns out to already be the right pattern, arrived at independently before
this research confirmed it's the established one.

---

## 7. Locks

Borrowing Playwright's `{ lock: 'name' }` concept directly: named locks so
Flows sharing a lock name never run concurrently — across Suites, across
the whole run — while everything else still parallelizes freely. Genuinely
useful for us specifically: a Flow touching a shared, non-concurrency-safe
resource (e.g., a singleton external account, a rate-limited third-party
sandbox) can declare a lock without forcing the *entire* Suite into serial
mode just to protect that one resource.

---

## 8. What's genuinely different from Playwright — not gaps, deliberate divergence

- **Static metadata / safety gating** (`safety: 'ask-first'`, Decision 15)
  — nothing in Playwright's model gates a test from running based on
  real-world side-effect risk. This is core to Evident's actual purpose and
  has no upstream equivalent to borrow.
- **Correlation** (trace/heuristic modes, Decision 2/18) — no Playwright
  equivalent; Playwright has no concept of "prove this evidence in another
  service is caused by this specific test run."
- **`defineFlow`'s static-metadata-plus-imperative-body split** (Decision
  4) — Playwright's `test()` doesn't need this because Playwright tests
  don't need to be safety-inspected before they run.

---

## 9. Original open questions — resolved

1. **Fixture scope naming — resolved: `'flow'` and `'suite'`.** Locking in
   §5's lean. Consistent with the existing naming family (Flow, Flow
   Suite) — no reason left to hedge on this one.

2. **`ask-first` + parallel/serial interaction — resolved.** This turns out
   not to be an execution-mode question at all. Safety level is static
   metadata (Decision 4) — readable without executing anything — so the
   check happens at CLI **resolution time**, before any execution mode
   (sequential/parallel/serial) even begins. Concretely: when an invocation
   targets a Suite, the CLI reads every targeted Flow's safety level
   up front. If *any* of them is `ask-first` and `--confirm` wasn't passed,
   the CLI refuses to run **anything** in that invocation — not a silent
   partial run. Silently skipping the risky Flow and running the rest would
   hide exactly the kind of gap this mechanism exists to prevent. A
   separate, explicit flag (e.g. `--skip-unconfirmed`) is the correct way
   to opt into "run the safe ones, skip the rest," rather than that being
   the default behavior.

3. **Serial Suite run bundles — resolved: one bundle per Flow, linked by a
   shared ID.** Not inventing a new "Suite bundle" artifact type — each
   Flow keeps producing its own run bundle (Decision 12 unchanged), but
   bundles from one serial Suite execution carry a shared `suiteRunId`
   field, so a reviewer (human or the AI Review Layer) can reconstruct the
   full sequence by following the reference. Minimal addition, no new
   artifact shape, no premature complexity for something not yet proven
   necessary.

4. **Automatic Fixtures — resolved: yes, with one concrete flagship
   example.** An automatic Fixture that fails a Flow if any involved
   service's logs contain an unexpected `ERROR`/`Exception`-level line
   during the Flow's execution window, unless explicitly allow-listed.
   This is deliberately a **cheap, deterministic, mechanical** check —
   distinct from and complementary to the AI Review Layer's deeper semantic
   review (Decision 8 layer): a fast free safety net that catches the
   obvious case without waiting on or paying for an LLM call. Opt-out-able
   per Flow, not forced — matches "pluggable, not prescriptive."

5. **Locks — resolved: explicit opt-in only, no automatic inference.**
   Matching Playwright exactly, and for the same reason they do it that
   way: two Flows touching the same service concurrently is the *normal*,
   fine case, not something needing protection by default. Auto-inferring
   locks from `evident.config.ts` (e.g. "same service = auto-lock") would
   over-serialize the common case to guard the rare one — the opposite of
   what locks are for.

## 10. New gaps found while resolving the above — resolved

1. **Flow-level timeout ceiling — resolved: yes, two-level default.** A
   `timeout` field alongside a Flow's existing static metadata
   (`name`/`services`/`safety`/`correlation`), capping the whole `run()`
   regardless of how many individual `poll()` calls it contains. Default
   value comes from `evident.config.ts` (e.g. `defaultFlowTimeout`), same
   "framework default, overridable per call" pattern already used for
   `expectBy`/`timeout` — not hardcoding a specific number in the framework
   itself, since a trivial Flow and a large `bulkLoop` need very different
   ceilings.

2. **Flow-level retries — resolved: supported, off by default, and never
   silently indistinguishable from a clean pass.** Same posture as Decision
   19 (no auto-retry by default, explicit per-Flow opt-in) — consistent
   with CLAUDE.md's own non-negotiable that a failing test gets fixed or
   reported, never quietly loosened. The distinction that makes this not a
   contradiction of that rule: a Flow that fails once and passes on retry
   records a distinct **"pass-after-retry"** outcome in the run bundle —
   same principle as "pass-flagged-slow," surfaced as a signal, never
   silently folded into an ordinary pass.

3. **Tags and filtering — resolved: add `tags` to static metadata.** A
   `tags: string[]` field alongside the existing static metadata, plus a
   CLI filter (`evident run --tag smoke`). Low-cost, matches an existing
   pattern (all static metadata is already readable pre-execution), and
   the need is confirmed, not speculative — the real project referenced
   for folder structure had 17 spec files, where tag filtering stops being
   optional.

4. **Multi-flow run summary output — resolved: per-Flow line + final
   count, batch exit code.** As each Flow in a batch completes, print one
   line (pass/fail/slow indicator, name, duration) — then a final summary
   count (e.g. "12 passed, 1 failed, 2 flagged slow"), in the spirit of
   Playwright's list reporter. Extends Decision 16's exit contract
   naturally: any failure anywhere in the batch → overall exit 1.

5. **Global pre-flight setup — resolved: automatic reachability check, not
   a user-defined hook.** Narrower than Playwright's `globalSetup` on
   purpose: we don't manage service lifecycle (services are started
   externally, e.g. `mvn spring-boot:run` in your own terminal), so there's
   no dev-server-starting use case to replicate. Instead: before triggering
   anything, `evident run` confirms every service a targeted Flow declares
   in `services:` actually responds, per `evident.config.ts`'s current
   target resolution — failing fast with a clear "service X unreachable"
   error rather than a confusing mid-run failure. Built into how the CLI
   resolves a run, not a separate hook a spec author has to remember to
   write.

6. **Skip/focus during development — resolved: add `skip` to static
   metadata; `--name` already covers "focus."** A `skip: true` (or a string
   reason, for a self-documenting skip) field alongside existing static
   metadata handles temporarily disabling a Flow without deleting it.
   "Focus on just one" is already solved — that's exactly what `--name`
   addressing (from the CLI open question earlier) does; no separate
   `only` mechanism needed on top of it.
