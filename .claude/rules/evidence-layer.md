---
paths:
  - "framework/src/evidence/**"
---

# Evidence layer

Three-way split (architecture.md §5, Decisions 8 and 17) — keep it distinct,
don't collapse it back into one thing:

- **Fetching** (`evidence.mongo()`, `evidence.logs()`, ...) — always
  domain-specific, ours.
- **Retry/timing** (`poll()`, `expectBy`/`timeout`/`delay`) — ours,
  purpose-built for this framework. Never a fixed `setTimeout` sleep here.
- **Comparing a fetched value** (`expect(...).toBe(...)`) — the standalone
  `expect` package. Don't invent comparison syntax.

Heuristic correlation search (Decision 18): bound every search to evidence
timestamped at or after the moment the trigger fired, and require the exact
declared `matchOn` value to appear. Never match on timing proximity alone —
a false-positive correlation is worse than no correlation.
