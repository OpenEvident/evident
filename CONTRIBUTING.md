# Contributing

Thanks for taking a look. This project is young, so the fastest way to get useful feedback on a change is to keep it small and focused.

## Getting set up

```bash
cd framework
pnpm install
pnpm run build
pnpm run test
```

If you want to see the framework actually exercise something real, follow [examples/services/README.md](examples/services/README.md) to boot the three example services, then run a flow spec from `examples/flows/` against them with the `evident` CLI.

## Before opening a pull request

From `framework/`:

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
pnpm run format:check
```

If you touched `examples/flows/`, also run `pnpm run typecheck` there, and, if the change is meant to actually work, run the relevant flow against the live services rather than trusting the type checker alone.

## Commit messages

Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`. Look at recent history for the tone this project uses; it tends to favor a short subject line plus a body that explains why, not just what changed.

## Code style

- `strict: true` in every `tsconfig.json`. Avoid `any` and unchecked `as` casts; if you need one, leave a comment explaining why it's actually safe there.
- Default to no comments. A comment earns its place when it explains a non-obvious constraint or the reasoning behind a decision, not when it restates what the next line already says.
- Public API surface in `framework/src` (exported functions, types, classes) gets a proper JSDoc block: params, return, and `@throws` where relevant.
- Infrastructure failures (a missing file, a refused connection) should fail immediately, not get silently retried as if they were "not true yet."

## Before an architectural change

Read [docs/architecture.md](docs/architecture.md) first. It has a decision log with every major call this project has made so far and, more usefully, what was considered and rejected. If your change contradicts one of those decisions, either the decision was wrong and the doc should say so, or the change needs a different shape.

## Reporting a bug

Open an issue with a minimal repro if you can. For anything that looks like a security issue, see [SECURITY.md](SECURITY.md) instead of opening a public issue.
