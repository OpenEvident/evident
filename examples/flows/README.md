# Flow spec sketches

**These are design sketches, not runnable specs yet.** `defineFlow`, `poll`,
`expect`, `evidence`, and `trigger` don't exist as real exports from
`evident` — only a placeholder `version()` export does (see
`framework/src/index.ts`). Nothing here will typecheck or run until Layer 2
(`defineFlow`) and Layer 3 (`poll`/evidence collectors) are implemented.

They exist to answer one question before writing that implementation: does
the API we designed on paper actually read well once pointed at a real
flow against the real `caller-service`/`receiver-service`? Cheaper to find
out now than after `poll()` is fully built and something underneath it
needs to change shape.

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
└── advanced.flow.ts        # grouped: asyncCallback / bulkLoop / mixedEvidenceCustomPoll
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
3. **`evidence.logs()` needed two distinct methods, not one** —
   `.waitFor()` (polls internally, used directly) and `.contains()` (a
   single-shot check, used *inside* a custom `poll()` condition in
   `mixedEvidenceCustomPoll`). This split wasn't explicit in
   architecture.md before; it fell out naturally from actually writing the
   mixed-evidence case. Worth confirming this is the intended shape rather
   than something to unify.
4. **The trigger response shape was assumed, not specified.** Nearly every
   flow here asserts `res.status`/`res.body`, assuming `trigger.api()`
   returns something Fetch-Response-shaped (`{ status, body }`). Never
   explicitly pinned down before — worth confirming when `trigger.api()` is
   actually implemented. The `Trigger`/`Evidence` interfaces in `clients/`
   are local stand-ins for this, not real framework types.
5. **Whether `trigger.api()` throws or returns-with-status on a non-2xx
   response is genuinely undecided**, and it directly determines how
   `triggerFailure` should be written. It currently assumes throw/reject
   (so the framework can categorize it as a trigger failure automatically,
   per Decision 19) and deliberately doesn't catch/assert on it — but if
   the real implementation instead returns a response object with
   `status: 500` for the caller to check, every other flow's
   `expect(res.status).toBe(...)` pattern would need to extend to the
   failure case too, and this one would need a rewrite.
6. **The CLI needs a way to address one flow within a multi-export file.**
   `evident run timeout.flow.ts` is ambiguous now that the file holds three
   flows. Something like `evident run timeout.flow.ts --name timeoutSlow`
   (mirroring Playwright's `--grep`) is the likely shape, but this wasn't
   part of the original CLI design and needs to be added to it.
