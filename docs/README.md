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
├── framework/      the library itself — scaffolded, tooling verified, core
│                    primitives (poll/expect/defineFlow) not yet implemented
└── examples/       V1 proof-of-concept — two minimal example Spring Boot
                     services (caller-service, receiver-service) proven
                     end-to-end, plus a second, larger set
                     (bulk-import-service, menu-service,
                     publishing-service — see examples/services/
                     NEXT_SERVICES_DESIGN.md) stress-testing correlation
                     under bulk/async/restart conditions, plus flow spec
                     sketches (not yet runnable — see
                     examples/flows/README.md) validating the API shape
                     before framework/ implements it for real
```

## Status

Requirements and architecture are resolved for V1 (multi-service, local-only,
REST trigger, log evidence, correlation proven). `framework/` is scaffolded
(build/lint/typecheck/test all verified working) and the two example
services are built and verified. Flow spec sketches exist in
`examples/flows/` (not yet runnable) to validate the spec-authoring API
before it's implemented for real. Core framework implementation
(`poll`/`expect`/`defineFlow`/CLI) has not started. See architecture.md §9
for exact V1 scope, §11 for what's deliberately still undecided, and
flow-model.md for the suite/hooks/fixtures design still being resolved.
