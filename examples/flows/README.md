# Flow specs

**These are real, runnable specs** against the real `bulk-import-service`/
`menu-service`/`publishing-service` (`examples/services/`), via the real
CLI:

```bash
pnpm exec evident run catalog-sync-pipeline.flow.ts
pnpm exec evident run stale-menu-requires-explicit-republish.flow.ts
pnpm exec evident run bulk-dispatch-timing-outcomes.flow.ts --name bulkDispatchPassButFlaggedSlow
pnpm exec evident run publish-validation-and-trigger-failures.flow.ts --name explicitPublishRequiresConfirmation --confirm
```

This replaces an earlier set of flows written against a smaller, simpler
`caller-service`/`receiver-service` pair (now removed). These are grounded
in the real three-service catalogue/publish pipeline instead, and named
for the actual business scenario each one proves — not by mechanism name
("advanced", "concurrency") — since every mechanism they exercise is
explained in its own doc comment.

## Structure

```
flows/
├── clients/                              # service-object layer, one file per service
│   ├── bulk-import-service.ts
│   ├── menu-service.ts
│   └── publishing-service.ts
├── catalog-sync-pipeline.flow.ts          # default export — the flagship end-to-end scenario
├── sync-skips-unchanged-content.flow.ts   # reSyncWithNoChangeIsANoOp
├── stale-menu-requires-explicit-republish.flow.ts   # 2 flows, serial suite, hooks + 3 fixture shapes
├── publish-validation-and-trigger-failures.flow.ts  # 3 flows
├── bulk-catalog-operations.flow.ts        # 4 flows, parallel suite
└── bulk-dispatch-timing-outcomes.flow.ts  # 3 flows — pass / pass-flagged-slow / fail
```

## What each flow demonstrates

| File | Export | Demonstrates |
|---|---|---|
| `catalog-sync-pipeline.flow.ts` | default | The whole real pipeline in one run: import → sync (cross-service dispatch + callback) → manual menu assembly → explicit publish → **REST read-back of the materialized view with a real tax-math assertion**. Mixes log evidence with response-value assertions in one flow. |
| `sync-skips-unchanged-content.flow.ts` | `reSyncWithNoChangeIsANoOp` | Proving a negative: re-syncing unchanged content skips dispatch entirely (`item.sync.skipped`), and menu-service never sees a second `product.saved` for that item — the second, dispatch-time hash (`synced_products`) doing its actual job. |
| `stale-menu-requires-explicit-republish.flow.ts` | `publishEstablishesTheMaterializedView` | Sets up a real published menu with a known price — companion setup to the flagship, kept minimal since the interesting checks live in the next flow. Also: `beforeAll`/`afterAll`/`beforeEach`/`afterEach` hooks, a Suite-scoped Fixture, a Flow-scoped Fixture that `deps` on it, and an `auto: true` Fixture (see the file's doc comment for why `auto: true` still has to be listed explicitly — it's currently inert in the runner). |
| | `staleMenuIsFlaggedThenExplicitlyRepublished` | A product price change flags a `PUBLISHED` menu `UPDATES_AVAILABLE` **without auto-republishing it** (materialized view still shows the old price), then an explicit republish actually updates it. `configureSuite({mode:'serial'})` — see the file's own doc comment for exactly why nested-object fixture mutation is required for cross-Flow state to work, and why the two export *names* (not just their declaration order) had to be chosen deliberately. |
| `publish-validation-and-trigger-failures.flow.ts` | `explicitPublishRequiresConfirmation` | `safety: 'ask-first'` on the real publish trigger — `evident run` refuses without `--confirm`. |
| | `invalidMenuFailsValidationWithoutATriggerError` | A real, reproducible validation failure (a product priced only in AED attached to a USD-priced menu) — the trigger itself still returns 202; the failure is only observable via `menu.validation_failed` and the absence of `menu.published`. Contrasted directly against the next flow. |
| | `malformedImportRequestIsARealTriggerFailure` | A genuinely malformed request (`items: []`, violates `@NotEmpty`) — `TriggerError` propagates unhandled, exactly the framework's own established idiom, so this Flow is *expected* to report `outcome: 'fail'` with a trigger-level error when run. |
| `bulk-catalog-operations.flow.ts` | `catalogSmokeCheck` | `tags: ['smoke']`, parallel execution mode. |
| | `lockedSyncOfARaceProneItem` | A named `lock` justified by a real correctness risk in this implementation (see the file's doc comment), not an artificial one. |
| | `bulkDispatchCompletesAcrossManyItems` | Calls menu-service's bulk endpoint directly with 15 items, then polls `GET /bulk/{batchId}/status` — a genuine **REST-response custom `poll()` condition**, the one mechanism no other flow here exercises. Flow-level `timeout`/`retries`. Includes the manual recipe for actually observing restart-recovery (see below). |
| | `pendingRestartRecoveryAutomation` | `skip`, with an honest reason: true mid-batch-restart automation needs a process-lifecycle primitive the framework doesn't have. |
| `bulk-dispatch-timing-outcomes.flow.ts` | `bulkDispatchPass` | The two-tier `expectBy`/`timeout` model (Decision 6) — the fast, ordinary case. |
| | `bulkDispatchPassButFlaggedSlow` | Same condition, deliberately slower than `expectBy` but still within `timeout` — asserts `poll()`'s own return value is `outcome: 'pass-flagged-slow'`, not just that the Flow overall passed. |
| | `bulkDispatchFailsOnTimeout` | Same condition again, now slower than `timeout` itself — a real `PollTimeoutError`. All three use a genuine, reproducible timing difference: `simulateItemDelayMs`, a small testing-only field added to menu-service's `POST /products/bulk` request DTO (see the file's doc comment for why — real load-proportional latency was considered and rejected as too fragile/machine-dependent for a precise three-way split). |

## What this exercise surfaced — real findings, from reading the framework's actual source, not assumed

Same spirit as the previous flow set's own "what this surfaced" section:
writing these against real code (`framework/src/`, not just the docs)
found mechanical details worth being explicit about.

1. **Fire-offset windowing is per Flow *run*, not per individual
   `trigger.api()` call.** `createTrigger` (`evidence/trigger.ts`) snapshots
   every declared service's log-file byte offset once, before the *first*
   `trigger.api()` call in a `run()` — every later call in that same run
   shares that one window. Concretely: a single Flow that published the
   same menu twice would have its second `menu.published` check see
   *both* occurrences (since both fall in the one shared window) and throw
   `DuplicateMatchError` on the default `expectedMatches: 1` — not a bug,
   just how the window is actually scoped. `stale-menu-requires-explicit-republish.flow.ts`
   is split into two Flows specifically because of this: each gets its
   own fresh window from its own `runFlow()` call, which is what actually
   makes "no auto-republish happened yet" a sound negative and "exactly
   one new publish" a sound positive.
2. **A Suite-scoped Fixture's value is shallow-copied fresh for every
   Flow that requests it** (`FixtureResolver.resolveForFlow`'s
   `mergeFixtureValue` does `{...target, ...value}` on every call) — so a
   top-level fixture field reassigned from inside one Flow's `run()`
   (`fixtures.foo = x`) only mutates that Flow's own throwaway copy and
   is invisible to the next Flow in the Suite. A *nested* object survives
   the shallow copy by reference (the same reason the earlier flow set's
   `batch.recordIds.push(...)` pattern worked). `stale-menu-requires-explicit-republish.flow.ts`
   documents and uses this directly (`{ shared: {...} }`, mutated as
   `shared.menuId = x`, never `fixtures.menuId = x`).
3. **Running a file with no `--name` executes its Flows in *alphabetical
   export-name* order, not source declaration order** — found by actually
   running `stale-menu-requires-explicit-republish.flow.ts` and watching
   the wrong Flow run first. `collectFlows()` (`cli-support.ts`) walks
   `Object.entries(moduleExports)`; a JS module namespace object's
   `[[OwnPropertyKeys]]` sorts its string keys alphabetically per the
   ECMAScript spec, independent of export order in the source. The
   earlier flow set's `lifecycle.flow.ts` (`seedBatch`/`verifyBatch`)
   never surfaced this because those two names already happen to sort
   alphabetically the same way they're declared — `suite-context.ts`'s
   "sequential (declared order) is the default" comment is accurate for
   *that* file by coincidence, not in general. Any serial-mode file with
   a real cross-Flow ordering requirement has to choose export names that
   already sort correctly, the way this file's two exports now do
   (`publishEstablishesTheMaterializedView` before
   `staleMenuIsFlaggedThenExplicitlyRepublished`).
4. **No mechanism exists to read a matched log line's field values back
   into a Flow.** `waitFor()`/`contains()` only report whether a pattern
   matched (plus `matchedVia`), never the parsed field values themselves.
   This is why `bulkDispatchCompletesAcrossManyItems` calls menu-service's
   `POST /products/bulk` *directly* rather than going through
   bulk-import-service's `/sync` — the resulting `batchId` is only ever
   visible in a log line (`item.sync.dispatched`'s `batchId` field) when
   dispatched that way, with no way to extract it back out; calling the
   bulk endpoint directly gets `batchId` straight from the response body
   instead.
5. **No per-trigger retry/idempotent option actually exists in
   `TriggerRequest`/`trigger.api()`** (`evidence/trigger.ts`) — confirmed
   by reading the actual interface, which has only `method`/`path`/`body`.
   Decision 19's "opt-in idempotent retry" is a stated design intent, not
   yet implemented. No flow in this suite claims to exercise it (the
   earlier flow set's `idempotentRetry` didn't actually pass any retry
   option to `trigger.api()` either, on inspection — it only demonstrated
   the *concept* in prose).
6. **No process-lifecycle primitive exists.** `trigger.api()` +
   `evidence.logs()` is the entire capability surface — nothing lets a
   Flow start, stop, or restart a service process. Genuine mid-batch
   restart-recovery testing (`batch.recovery.resumed`) needs a human to
   manually kill and restart the service while a Flow is mid-flight;
   `pendingRestartRecoveryAutomation` documents this as a real, permanent
   capability boundary rather than a temporary gap.
7. **`correlation: 'trace'` has no different runtime behavior in the
   framework today.** The match ladder (`evidence/matching.ts`) upgrades
   to the `trace-id` rung purely based on whether a log line happens to
   carry a non-empty `trace_id` field — it never branches on the
   declared `correlation` mode at all. Since none of these three services
   run with the OTel Java agent attached, a dedicated "trace mode" flow
   for them would be functionally identical to heuristic mode. Skipped
   here for that reason — the earlier `caller-service`/`receiver-service`
   flow set already fully explored the concept where an agent-comparison
   was actually meaningful.
8. **`auto: true` on a Fixture is currently inert.** Read
   `fixture.ts`/`fixture-resolver.ts`/`run-flow.ts`/`run-suite.ts` in full
   looking for whatever reads that field to auto-inject the Fixture into
   every Flow in a Suite — nothing does. `resolveForFlow` only ever
   resolves whatever's explicitly listed in `flow.fixtures`; `auto`
   is declared on the `Fixture<T, Deps>` interface but never actually
   consulted anywhere in the runner. A Fixture with `auto: true` still
   has to be listed explicitly in every Flow's own `fixtures: [...]`
   array to run at all. The earlier flow set's `lifecycle.flow.ts`
   already did this correctly (both its Flows explicitly listed
   `noUnexpectedErrorsFixture` despite its `auto: true`) — easy to miss
   since the field still *reads* naturally as "the automatic one," and
   its doc comment there described intent (flow-model.md §9.4), not
   current behavior.

## Running locally

Start the three services first (see `examples/services/README.md`'s
Quick start), then:

```bash
pnpm exec evident run catalog-sync-pipeline.flow.ts
pnpm exec evident run sync-skips-unchanged-content.flow.ts
pnpm exec evident run stale-menu-requires-explicit-republish.flow.ts   # runs both flows, serially, in the file's declared order
pnpm exec evident run publish-validation-and-trigger-failures.flow.ts --name explicitPublishRequiresConfirmation --confirm
pnpm exec evident run publish-validation-and-trigger-failures.flow.ts --name invalidMenuFailsValidationWithoutATriggerError
pnpm exec evident run publish-validation-and-trigger-failures.flow.ts --name malformedImportRequestIsARealTriggerFailure   # expected to report outcome: 'fail' — that's the point
pnpm exec evident run bulk-catalog-operations.flow.ts   # runs all 4 (parallel), pendingRestartRecoveryAutomation is skipped
pnpm exec evident run bulk-dispatch-timing-outcomes.flow.ts --name bulkDispatchPass
pnpm exec evident run bulk-dispatch-timing-outcomes.flow.ts --name bulkDispatchPassButFlaggedSlow
pnpm exec evident run bulk-dispatch-timing-outcomes.flow.ts --name bulkDispatchFailsOnTimeout   # expected to report outcome: 'fail' — that's the point
```

Every run writes a run bundle to `.evident/runs/<runId>.json` and prints
its path — `evident run` exits `1` on any Flow failure (including the
deliberately-failing `malformedImportRequestIsARealTriggerFailure`), `0`
otherwise.
