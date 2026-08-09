# Evident

AI-driven multi-service verification framework — built to be used *by*
coding agents (Claude Code and others) as a tool, not to embed agent/LLM
logic itself. Read @docs/README.md before any architectural change — it
indexes requirements, prior-art research, and the architecture decision log
(22 resolved decisions, each with rejected alternatives and why).

## Scope discipline

V1 is REST-triggered, local-only, multi-service, log-evidence, correlation
proven end-to-end — see `docs/architecture.md` §9. Mongo/Neo4j, CloudWatch,
MCP, and Playwright triggers are real parts of the design but **out of
scope until V1 proves the correlation mechanism**. Building toward them now
is scope creep, not helpfulness — check §9 before adding anything that
looks like it belongs to a later layer.

## Non-negotiables

- `strict: true` in every `tsconfig.json`, no unjustified `any` or
  unchecked `as`. This framework's entire value is catching bugs in *other*
  systems — it can't have type-safety holes in itself.
- Infrastructure errors (file not found, connection refused) fail fast.
  Only "not true yet" assertion failures get retried by `poll()`. A missing
  log file should never silently retry for 15 seconds before surfacing as
  a timeout — that's a different failure and should look like one.
- New dependency = the same treatment tsdown/Commander/ESLint got: verify
  actual download/maintenance data against the npm registry, not
  reputation. See `docs/project-setup.md`'s decision log for the standard.
- Redact known-sensitive fields (tokens, auth headers, credentials) before
  writing a run bundle. Bundles are built to be handed to another agent
  session or a teammate, so anything captured in one is implicitly shared.
- If a test doesn't pass, fix the root cause or stop and report why. Don't
  loosen the assertion or skip it to get green.

## Comments

Default to no comments. Two things earn one, both as a proper JSDoc
`/** ... */` block positioned above the declaration, never stacked `//`
lines:

- A non-obvious **why** — a hidden constraint, a subtle invariant, the
  reasoning behind a design decision.
- **Public API surface** in `framework/src` — exported functions, types,
  and classes get param/return/`@throws` documentation, since that's what
  IDE hover and consuming code see. Internal/unexported code doesn't need
  this.

Never comment WHAT the code does when the code already reads that clearly,
and never reference the task/fix that produced it.

## Testing

- `poll()` and anything using `expectBy`/`timeout`/`delay`: test with
  Vitest's `vi.useFakeTimers()`, not real sleeps. A suite that actually
  waits 15s per timeout case gets slow, then gets skipped.
- From `framework/`: `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`
  (`pnpm run build` before publishing or checking bundle output). The
  `PostToolUse` hook (`.claude/hooks/check-framework.sh`) already runs
  typecheck/lint/test automatically on edits to `framework/src/**` — these
  are for running manually or after touching config/tests outside `src/`.

## Reviewing this codebase

When reviewing a diff (`/code-review` or otherwise): flag only gaps that
affect correctness or a stated requirement. Chasing every possible
finding — extra abstraction, defensive code for cases that can't happen,
tests for impossible states — is over-engineering, not thoroughness.
