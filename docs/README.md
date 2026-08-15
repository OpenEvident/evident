# Documentation

**Evident** — an AI-driven verification framework for multi-service flows — Spring Boot
services connected via REST, Kafka, webhooks, and bulk processing, tested
end-to-end (API responses, database state, logs) rather than in isolated
unit tests. Built to be used *by* coding agents (Claude Code and others) as
a tool, the way Playwright is used by whatever writes and runs its tests —
not as an agent or harness itself.

## Read in this order

| Doc | What it answers |
|---|---|
| [requirements.md](./requirements.md) | What must this system do, and why? Product-level scope, before any technical decisions. |
| [research.md](./research.md) | What already exists (Tracetest, Karate, WireMock, and others), verified against real source — so the architecture builds on proven patterns instead of reinventing them. |
| [architecture.md](./architecture.md) | How it's actually built: the layered design, every resolved decision with its rejected alternatives and rationale, and what's still open. **Start here** if you only read one document. |
| [flow-model.md](./flow-model.md) | The spec-authoring vocabulary — Flows, Flow Suites, hooks, fixtures, sequential/parallel/serial execution, locks — verified against Playwright's own source, borrowed deliberately where the problem is the same shape and diverged deliberately where it isn't. |
| [project-setup.md](./project-setup.md) | Tech stack, folder structure, and how the repo is scaffolded to be developed effectively by Claude Code specifically. |

A [visual walkthrough](https://claude.ai/code/artifact/1fcc61d2-7011-4525-a88a-42c25b956292) of the architecture — the layered stack, a run's execution sequence, the two-tier timeout model, and the two correlation modes side by side — complements architecture.md for anyone who wants the shape of the system before the prose.

## Project layout

```
dev-tools/
├── docs/          you are here
├── research/       cloned reference repos used during research — not part of
│                    this project's own code, gitignored, never committed
├── framework/      the library itself — implemented: defineFlow, poll,
│                    Trigger/Evidence (matchOn ladder, .record extraction),
│                    Fixtures (scope:'flow'|'suite', trigger/evidence access,
│                    defineServiceClientFixture), Suite hooks/modes/locks,
│                    custom expect matchers, the evident CLI, run bundles +
│                    retention. Build/lint/typecheck/test/format all green.
└── examples/       V1 proof-of-concept — three real Spring Boot services
                     (bulk-import-service, menu-service, publishing-service;
                     see examples/services/README.md) exercising bulk/async/
                     restart-recovery correlation, plus 7 real, runnable flow
                     spec files (examples/flows/) proven live end-to-end
                     against all three via the real evident CLI — not
                     sketches validating a shape, but the actual thing
```

## Status

Requirements and architecture are resolved for V1 (multi-service, local-only,
REST trigger, log evidence, correlation proven). Core framework
implementation (`poll`/`expect`/`defineFlow`/Fixtures/Suites/CLI/run
bundles) is done and verified — `framework/`'s full build/lint/typecheck/
test/format pipeline is green, and every mechanism has been exercised for
real: `pnpm exec evident run <file>.flow.ts` against the three live
example services, not just typechecked. See architecture.md §9 for exact
V1 scope, §11 for what's deliberately still undecided (Mongo/Neo4j/
CloudWatch/MCP/Playwright triggers — out of scope until V1's correlation
mechanism is proven, which it now is), and flow-model.md for the
suite/hooks/fixtures design, now implemented as described.
