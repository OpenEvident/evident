# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Core framework: `defineFlow`, `trigger.api()`, `evidence.logs().waitFor()`/`.contains()`, `poll()`, the three-rung correlation match ladder, Fixtures (`scope: 'flow'` / `'suite'`, dependency chaining, service-client binding via `defineServiceClientFixture`), Suite hooks and execution modes, named locks, the `evident` CLI, and run bundles with redaction.
- `extractString`/`extractNumber`/`extractBoolean` for reading typed fields off a matched log record.
- `findItem`/`requireDefined` helpers.
- `toContainItem` custom matcher on the standalone `expect` package.
- Three example Spring Boot services (`bulk-import-service`, `menu-service`, `publishing-service`) and seven real flow specs proving the framework end to end.
- Project made open source under Apache-2.0.

No tagged releases yet. This project is still V1: local-only, REST-triggered, log-evidence correlation.
