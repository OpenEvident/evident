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

Heuristic correlation search (Decisions 18, 25): bound every search to
evidence timestamped at or after the moment the trigger fired, and require
every declared `matchOn` field/value pair to appear (composite, AND'd).
Never match on timing proximity alone — a false-positive correlation is
worse than no correlation. Matching itself runs a 3-rung ladder in
`evidence/matching.ts` (substring → JSON exact-field lookup →
`trace_id` corroboration) — never add a fourth path or bypass it with a
one-off check inside `evidence.ts`; extend `findMatches()` instead so the
ladder stays the single source of truth. `expectedMatches` (default `1`)
is only enforced when `matchOn` is declared, and a duplicate throws
`DuplicateMatchError` immediately rather than being retried by `poll()`.
