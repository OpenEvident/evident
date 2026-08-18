<div align="center">

# Evident

**A framework for verifying flows across multiple services, built to be used by coding agents.**

![GitHub top language](https://img.shields.io/github/languages/top/OpenEvident/evident)
![visitors](https://visitor-badge.laobi.icu/badge?page_id=OpenEvident.evident.visitor-badge&left_text=visitors&right_color=%23123fc4&format=true&logo=github)
![GitHub forks](https://img.shields.io/github/forks/OpenEvident/evident?style=social)
![GitHub contributors](https://img.shields.io/github/contributors/OpenEvident/evident)
![GitHub Repo stars](https://img.shields.io/github/stars/OpenEvident/evident?style=social)
![GitHub repo size](https://img.shields.io/github/repo-size/OpenEvident/evident)
![GitHub watchers](https://img.shields.io/github/watchers/OpenEvident/evident?style=social)
![GitHub issues](https://img.shields.io/github/issues/OpenEvident/evident)
![GitHub pull requests](https://img.shields.io/github/issues-pr/OpenEvident/evident)
![GitHub](https://img.shields.io/github/license/OpenEvident/evident)

</div>

## The problem

A request rarely stays inside one service anymore. It gets picked up, handed to another service, written somewhere, and closed out by a callback that fires seconds later on a completely different process. A unit test can't see any of that, and checking it by hand means tailing three log files at once and squinting for the right line.

Evident is a framework for writing that check as code: fire a real request, then prove what happened downstream by reading the logs those services already produce. It gives you the vocabulary to do that (Flows, Suites, Fixtures, correlation, polling with a soft and a hard timeout) the same way Playwright gives you `test`, `describe`, and fixtures for browser automation. It isn't an agent, doesn't call an LLM, and makes no decisions on its own. It's infrastructure something else, a coding agent or a person, drives directly.

```typescript
import { defineFlow, expect } from 'evident';

export default defineFlow({
  name: 'order-reaches-fulfillment',
  services: ['orders-service', 'fulfillment-service'],
  safety: 'safe',
  correlation: 'heuristic',
  async run({ trigger, evidence }) {
    const res = await trigger.api('orders-service', {
      method: 'POST',
      path: '/orders',
      body: { sku: 'SKU-1', quantity: 2 },
    });
    expect(res.status).toBe(201);

    await evidence.logs('fulfillment-service').waitFor('order accepted', {
      matchOn: [{ field: 'orderId', value: res.body.orderId }],
      expectBy: '2s',
      timeout: '10s',
    });
  },
});
```

Correlating the trigger to the evidence is the actual hard part, and it's what most of the framework's design is about: a three-rung matching ladder (plain text, then an exact field lookup on structured JSON, then trace-id corroboration when one's available), a search window bounded to what was appended after the trigger fired so a stale match from an earlier run can never sneak in, and a two-tier timeout so a slow pass gets flagged instead of quietly treated as a hard failure.

## Local-only, for now

Right now `evident run` targets services on your own machine: it makes real HTTP calls to whatever base URLs you point it at and tails local log files. That's a deliberate first step, not the ceiling. Playwright started the same way, driving a local browser, before it grew into something CI pipelines and cloud runners use routinely. The plan here is similar: prove the correlation mechanism works end to end locally first, then extend where the evidence and the trigger can come from (a deployed service's CloudWatch logs, a database read instead of just logs, an MCP surface, a Playwright-driven UI trigger). None of that is built yet. The architecture doc explains why that's a deliberate sequencing choice, not an oversight.

## Architecture

Four layers, each one only depending on the layer below it:

1. **Configuration and target resolution.** `evident.config.ts` maps a service name to a base URL and a log path per target (local today, deployed later).
2. **Spec format.** `defineFlow` separates static metadata (which services a Flow touches, its safety level, its correlation mode) from the imperative `run()` body, so the CLI can read what a Flow is about to do before it does it.
3. **Evidence and assertion library.** `trigger.api()` fires the request. `evidence.logs().waitFor()` polls for the matching line, bounded to what got appended after the trigger fired. `poll()` is the generic primitive underneath both, and it's what any custom REST-response condition uses too.
4. **CLI and runner.** Deterministic, no LLM involved anywhere in this layer. Resolves config, runs the Flow (or every Flow in a Suite, sequential, parallel, or serial), and writes a run bundle with the full trigger/assertion record.

A fifth layer, a thin MCP surface over the first four, is designed but intentionally not built yet. See [docs/architecture.md](docs/architecture.md) for the full reasoning and the decision log behind each layer.

## What's in this repository

```
dev-tools/
├── docs/           requirements, architecture decisions, and the flow-authoring
│                    model, each with the alternatives that were rejected and why
├── framework/      the library: defineFlow, trigger/evidence, poll(), Fixtures,
│                    Suites, the CLI, run bundles
└── examples/
    ├── services/    three real Spring Boot services, wired to exercise bulk
    │                import, async dispatch, and restart-recovery correlation
    └── flows/       real flow specs run against those services, not sketches
```

## Tooling

- Node.js `>=24`
- pnpm
- Java 17 and Maven, only needed if you're running the example services
- Docker, only needed for the example services' MongoDB and Redis

## Trying it

```bash
git clone https://github.com/OpenEvident/evident.git
cd evident/framework
pnpm install
pnpm run build
pnpm run test
```

To watch it actually correlate something, boot the three example services first, see [examples/services/README.md](examples/services/README.md) for the exact steps (it includes a Docker Compose file for MongoDB and Redis), then point the CLI at a real flow:

```bash
cd examples/flows
pnpm exec evident run catalog-sync-pipeline.flow.ts
```

Every run writes a bundle to `.evident/runs/`, a full record of each trigger call and each assertion, and prints where it landed.

## Common commands

From `framework/`:

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
pnpm run format:check
```

From `examples/flows/`:

```bash
pnpm run typecheck
pnpm exec evident run <file>.flow.ts
```

## Documentation

- [requirements.md](docs/requirements.md), what this has to do, decided before any technical choices
- [research.md](docs/research.md), what already existed (Tracetest, Karate, WireMock) and where the real gap was
- [architecture.md](docs/architecture.md), the layered design and every resolved decision, with what was rejected and why
- [flow-model.md](docs/flow-model.md), Flows, Suites, hooks, Fixtures, execution modes
- [project-setup.md](docs/project-setup.md), tech stack and how the repo is structured

## Status

The framework side is implemented and tested: `defineFlow`, `poll`, Trigger and Evidence, Fixtures, Suite hooks and execution modes, the CLI, and redacted run bundles. All of it has been run for real against the three example services, not just typechecked. See [docs/architecture.md](docs/architecture.md) for exactly what's in scope for this first version and what's intentionally still open.

## Contributing, security, license

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [SECURITY.md](SECURITY.md)
- [CHANGELOG.md](CHANGELOG.md)
- Licensed under [Apache 2.0](LICENSE)
