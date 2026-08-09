# Flow specs

**These are real, runnable specs.** `defineFlow`, `poll`, `expect`,
`evidence`, `trigger`, hooks, fixtures, `configureSuite`, and the CLI are
all implemented in `framework/src/`. Every file here typechecks and runs
against the real `caller-service`/`receiver-service`, via the real CLI:

```bash
pnpm exec evident run basic-pass.flow.ts
pnpm exec evident run timeout.flow.ts --name timeoutSlow
pnpm exec evident run safety.flow.ts --confirm
```

They started as design sketches to answer one question before writing the
implementation: does the API designed on paper actually read well once
pointed at a real flow? What's here now is what that process converged
on — validated by actually running, not just by typechecking.

## Structure

```
flows/
├── clients/                # service-object layer — one file per service,
│   ├── caller-service.ts   #   typed wrappers around its endpoints/evidence,
│   └── receiver-service.ts #   so the raw path/method/body shape lives in
│                            #   one place instead of repeated in every flow
├── basic-pass.flow.ts      # stands alone — the entry-point example
├── timeout.flow.ts         # grouped: timeoutPass / timeoutSlow / timeoutFail
├── correlation.flow.ts     # grouped: heuristicMode / traceMode
├── safety.flow.ts          # grouped: askFirst / idempotentRetry / triggerFailure
├── advanced.flow.ts        # grouped: asyncCallback / bulkLoop / mixedEvidenceCustomPoll
├── lifecycle.flow.ts       # grouped: seedBatch / verifyBatch — hooks, fixtures, serial mode
└── concurrency.flow.ts     # grouped: smokeCheck / rateLimitedCall / retryableBulkStep / pendingInvestigation
```

Modeled after a real internal Playwright API-testing project's shape
(service-object layer + feature-grouped spec files, not one file per single
case) — not our own invention. **A `.flow.ts` file can export multiple named
flows**, same as a Playwright spec file holds multiple `test()` cases under
one `describe()`. Decision 21's "no mandated directory structure" still
holds — this grouping is a convention we're choosing to follow, not
something the framework enforces.

## What each flow demonstrates

| File | Export | Demonstrates |
|---|---|---|
| `basic-pass.flow.ts` | default | The baseline shape — trigger + response assertion + one log assertion |
| `timeout.flow.ts` | `timeoutPass` / `timeoutSlow` / `timeoutFail` | The two-tier `expectBy`/`timeout` model (Decision 6) as three concretely runnable outcomes — once `poll()` is real, running all three should produce exactly pass / pass-flagged-slow / fail |
| `correlation.flow.ts` | `heuristicMode` / `traceMode` | Both correlation modes (Decision 2/18) side by side — the ergonomic difference is visible in code, not just prose |
| `safety.flow.ts` | `askFirst` | `safety: 'ask-first'` gating (Decision 15) |
| `safety.flow.ts` | `idempotentRetry` | The trigger-retry opt-in (Decision 19) |
| `safety.flow.ts` | `triggerFailure` | A failed trigger reported distinctly from a failed assertion (Decision 19) |
| `advanced.flow.ts` | `asyncCallback` | The `delay` option, and asserting on the trigger's own response directly |
| `advanced.flow.ts` | `bulkLoop` | Why `defineFlow` needs a real imperative body, not a static list (Decision 4) — a genuine loop over N records, each with its own response assertion |
| `advanced.flow.ts` | `mixedEvidenceCustomPoll` | The generic `poll()` primitive combining evidence from two services in one condition (Decision 8) |
| `lifecycle.flow.ts` | `seedBatch` / `verifyBatch` | Hooks (`beforeAll`/`afterAll`/`beforeEach`/`afterEach`), Suite-scoped and Flow-scoped Fixtures, an automatic Fixture, and serial execution mode with state shared via a Fixture rather than closures (flow-model.md §4-6, §9.4) |
| `concurrency.flow.ts` | `smokeCheck` / `rateLimitedCall` / `retryableBulkStep` / `pendingInvestigation` | Parallel execution mode, named locks, `tags`, Flow-level `timeout`/`retries`, and `skip` (flow-model.md §6-7, §10.1-10.3, §10.6) |

## What this exercise surfaced — real open questions, not yet resolved

Writing these against real code did what it was supposed to: it found gaps
that reasoning about the design in the abstract didn't.

1. **Correlation mode is declared in two places that could conflict.**
   `evident.config.ts` sets it per-service; `defineFlow`'s own metadata also
   has a top-level `correlation` field (see the architecture.md Layer 2
   example). Neither doc says which wins if a flow claims `'trace'` but the
   service config says `'heuristic'`, or how that's surfaced if they
   disagree. Needs a decision before `defineFlow` is implemented.
2. **No clean mechanism yet for switching a service between correlation
   modes across runs.** `correlation.flow.ts`'s `traceMode` needs both
   services relaunched with the OTel agent *and* the config's correlation
   fields flipped to `'trace'` — right now that means hand-editing
   `evident.config.ts` between runs. Worth deciding whether this becomes an
   env-var override, multiple config profiles, or a CLI flag before this
   becomes a real annoyance.
3. **`evidence.logs()` needed two distinct methods — confirmed, both real.**
   `.waitFor()` polls (built on `poll()` internally) and `.contains()` is a
   single-shot check for use inside a custom `poll()` condition — exactly
   as `mixedEvidenceCustomPoll` assumed.
4. **The trigger response shape — confirmed: `{ status, body }`,
   Fetch-Response-shaped.** `Trigger`/`Evidence` now import the real types
   from `evident` (`clients/*.ts` no longer declare local stand-ins).
5. **`trigger.api()` throws on a non-2xx response — confirmed.** Non-2xx
   throws `TriggerError` (carrying `status`/`body`), never returned as a
   value to check. `triggerFailure`'s original assumption (no
   catch/assert, let it propagate) was correct as written.
6. **CLI addressing of one flow in a multi-export file — resolved:
   `--name`, matched against the export identifier.**
   `evident run timeout.flow.ts --name timeoutSlow` runs just that one.
   Omitting `--name` runs every exported Flow in the file.
7. **Fixture dependency resolution — resolved.** A Fixture depends on at
   most one other Fixture, by object reference (`deps: batchFixture`),
   resolved before the dependent's own `setup` runs. `run()`'s `fixtures`
   param is properly typed as the merged shape of everything a Flow
   requests — `defineFlow` is generic over the `fixtures` array, inferring
   each Fixture's value type and intersecting them (`UnionToIntersection`),
   with the returned `Flow` object itself erasing that generic since a
   Suite holds a heterogeneous array the runner treats uniformly.
8. **Whether `configureSuite`'s mode applies uniformly — resolved: yes, by
   rule.** One file is one Suite is one execution mode; `configureSuite`
   registers against a single module-level registration window opened
   right before that file is imported. Mixing modes in one file isn't
   supported — if you need two, that's two files, same as
   `lifecycle.flow.ts` and `concurrency.flow.ts` already are.
