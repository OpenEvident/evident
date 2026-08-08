# Project Setup — Tech Stack, Folder Structure, AI-Ready Scaffolding

**Status:** Proposal — pending confirmation on flagged items (§4)
**Last updated:** 2026-08-08
**Related docs:** [architecture](./architecture.md)

Every capability claim below (CLAUDE.md, skills, hooks, subagents) is
verified directly against current `code.claude.com/docs` pages, not secondhand
summary — see the sourcing note at the end for why that distinction mattered
here specifically.

---

## 1. Tech stack

Versions below are pinned to current latest-stable, verified directly against
the npm registry API (`registry.npmjs.org/<pkg>/latest`) and `nodejs.org`'s
release index on 2026-08-08 — not a search summary, given how wrong the
citty/Commander download comparison turned out to be when checked the same
way (§ CLI argument parsing).

| Concern | Choice | Pinned version | Why | Rejected |
|---|---|---|---|---|
| Language | TypeScript | **7.0.2** | Already Decision 3 | Java/JVM |
| Runtime | Node.js | **24.x** (current Active LTS) | Higher than the bare "fetch works since 18" floor referenced in architecture.md Decision 14 — that's the minimum for one feature, not our target baseline. Targeting current Active LTS rather than the old Node 18 floor or the non-LTS v26 current-release line, since a library's baseline should track the version consumers are actually deployed on. | Node 18 (old — only relevant as fetch's minimum, not a real target); Node 26 (not yet LTS) |
| Build | tsdown | **0.22.14** | tsup successor, actively maintained (§ below) | tsup (unmaintained), raw `tsc` |
| Test runner | Vitest | **4.1.10** | Best DX for this project's non-trivial async logic | `node:test`, Jest |
| CLI argument parsing | Commander | **15.0.0** | ~470M weekly downloads (verified via npm API) vs. citty's ~28M — not the "roughly comparable" picture a search summary suggested; citty is also still pre-1.0 | citty (reversed after verification), raw `util.parseArgs` |
| Linter | ESLint | **10.8.1** | See lint/format decision below | Biome, Biome+typescript-eslint hybrid |
| Formatter | Prettier | **3.9.6** | Long-proven pairing with ESLint via `eslint-config-prettier` | Biome (as formatter) |
| Type-aware lint rules | typescript-eslint | **8.66.0** | Natively covers `no-floating-promises`/`no-unsafe-assignment` — the rules that matter most given how async-heavy this codebase is | Biome's still-partial type-aware rule set |
| ESLint/Prettier conflict resolution | eslint-config-prettier | **10.1.8** | Turns off ESLint formatting rules that would fight Prettier | — |
| Assertion comparison syntax | expect (standalone) | **30.4.1** | Decision 17 — mature matcher vocabulary, not reinvented | Playwright's auto-retrying `expect` variant |
| Package manager | pnpm | **11.20.0** | Strict `node_modules` (phantom-dependency protection — matters once `framework` is published), more mature native workspace protocol than npm's | npm workspaces |
| Task orchestration | — (none yet) | — | Turborepo would be real overhead with no payoff at one real workspace package (`examples` is deliberately not a member — see §2). Add later if the package count grows enough to need it. | Turborepo now |

**Lint/format reasoning (ESLint+Prettier+typescript-eslint over Biome):**
operationally familiar to whoever maintains this, better-represented in any
model's training data than Biome's newer rule set, and closes the specific
promise-safety gap that matters most for this codebase — both real
reliability properties, not just preference. Full writeup of this reversal
is in the conversation that produced this doc; the table above reflects the
final call.

---

## 2. Folder structure

```
dev-tools/                     (repo root — already git-init'd)
├── CLAUDE.md                  (new — see §3)
├── package.json               (new — root)
├── pnpm-workspace.yaml        (new — packages: ["framework"] ONLY — examples is
│                                deliberately not a workspace member, see §2 note)
├── .gitignore                 (existing)
├── docs/                      (existing — README, requirements, research, architecture, this file)
├── research/                  (existing — gitignored third-party clones, never enters history)
├── .claude/                   (new — see §3)
│   ├── skills/
│   ├── agents/
│   └── rules/
├── framework/                 (new — the library; what eventually gets open-sourced)
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── config/            (Layer 1 — target resolution, .env)
│   │   ├── flow/              (Layer 2 — defineFlow)
│   │   ├── evidence/          (Layer 3 — poll(), evidence collectors)
│   │   ├── cli/                (Layer 4 — verify run / verify list)
│   │   └── index.ts
│   └── tests/
└── examples/                  (new — V1 proof-of-concept flow specs, private)
    ├── package.json           (depends on "framework": "link:../framework" —
    │                            a plain local-path reference, NOT the pnpm
    │                            workspace protocol)
    ├── verify.config.ts
    └── *.flow.ts
```

This matches Decision 20 (repo layout) exactly — just filling in what was a
placeholder split with real internal structure.

**`examples` is deliberately not part of the package graph.** It isn't
listed in `pnpm-workspace.yaml`, isn't a workspace member, and isn't "the
system" in any sense that build/version/publish tooling would ever act on.
It's a separate, private consumer that happens to live in this repo for
convenience — the same relationship any external project has to the
published framework, just pointed at the local path instead of a registry
version. `link:../framework` gives it real access to the actual framework
code to write and run V1 flow specs against, without pnpm treating it as
part of the workspace.

---

## 3. AI-ready scaffolding — verified against current docs

### CLAUDE.md

Verified guidance: keep it under ~200 lines — longer files measurably reduce
adherence. Belongs here: build/test commands, architectural pointers (link to
`docs/architecture.md` rather than restating it), the guiding principles from
the architecture doc stated as hard constraints (no LLM inside the framework;
pluggable, not prescriptive), project-specific gotchas. Multi-step procedures
belong in a skill instead, not inline here.

Nested `CLAUDE.md` files are supported per-directory (e.g.
`framework/CLAUDE.md` for library-specific conventions distinct from
`examples/CLAUDE.md`) — worth using given the two packages have genuinely
different concerns (one is library implementation, the other is
spec-authoring).

### Skills — candidates worth defining once there's real code

Project skills live at `.claude/skills/<name>/SKILL.md`. Two genuine
candidates for this project specifically, not generic boilerplate:

- **A "new flow" skill** — scaffolds a `*.flow.ts` file with the
  `defineFlow` shape already filled in (metadata fields, `run()` stub),
  since that structure (Decision 4) is specific enough to this project that
  getting it right from a blank file each time is wasted effort.
- **Claude Code already ships a relevant bundled mechanism worth knowing
  about here**: `/run-skill-generator` and `/verify` (bundled skills, not
  something to build) record how to launch/verify *this specific project*
  the first time they're used, writing the recipe to
  `.claude/skills/verify/SKILL.md` so later sessions don't re-derive it.
  Worth running once real code exists, rather than hand-writing an
  equivalent.

Not worth a custom skill: anything that's just "run the linter" or "run the
tests" — those are one command, better handled as a hook or a `package.json`
script than a skill.

### Hooks — verified event list (31 events), concrete candidates for this project

Two realistic, non-generic hooks for this specific codebase:

- **`PostToolUse` on edits to `framework/src/**`** running `tsc --noEmit` +
  the test suite for the touched module — catches a broken `poll()` or
  `defineFlow` change immediately, which matters more here than in a typical
  project since so much of this framework's value is in getting timing/retry
  semantics exactly right.
- **A `PreToolUse` guard on `examples/**`** specifically blocking edits that
  would make a `flow.ts` file's `safety: 'ask-first'` metadata
  non-static (e.g. computed at runtime) — since Decision 4's entire
  justification was that safety level must be readable without executing
  code. A hook is a mechanical way to actually enforce that invariant,
  not just document it.

### Subagents — one real candidate, not several

Given the framework's own scope, most of the "obviously useful" subagent
ideas (a generic "test debugger," a generic "code reviewer") aren't specific
to this project — they're already covered by Claude Code's built-ins
(`general-purpose`, `Explore`) or by `/code-review`. The one genuinely
project-specific candidate: once the heuristic-correlation search algorithm
(Decision 18) is implemented, a subagent scoped to *just* stress-testing that
one mechanism against real concurrent-traffic log samples — isolating a
noisy, iterative debugging loop from the main conversation. Not worth
defining until that code exists to stress-test.

### settings.json — deliberately not written yet

Needs your explicit review rather than my proposing exact allow/deny rules,
given §0. Once `framework/` has real commands to run (`npm test`, `npm run
build`), we should write this together, reviewing each permission grant
rather than adopting a template.

---

## 4. Open items for you

1. **Biome vs. ESLint+Prettier** — least-verified pick above, want a closer look before locking it in?
2. **citty vs. Commander vs. native `util.parseArgs`** — citty proposed, not locked.
3. Ready to scaffold `framework/` and `examples/` with this structure now, or refine further first?

---

## Sourcing note

An earlier research pass used a subagent to check Claude Code's current
capabilities. Its report was flagged by the harness: it contained
instruction-shaped content (specifically permission allow/deny blocks) that
got neutralized as a safety measure — not evidence of anything malicious, but
enough reason not to trust it at face value, especially the parts that would
grant tool permissions if copied verbatim. Every capability claim in §3 above
was independently re-verified directly against `code.claude.com/docs`
afterward. The **settings.json permissions content is deliberately not
included in §3** — that needs your explicit review before anything gets
written, for the same reason.
