# Security Policy

## Scope

Evident is a local-only tool. Running `evident run` on your machine makes real HTTP calls to services you've configured in `evident.config.ts` and reads log files you've pointed it at. There's no cloud component, no telemetry, and nothing phones home.

The parts worth thinking about from a security angle:

- **Run bundles** (`.evident/runs/*.json`) capture the full request/response of every trigger call and the full raw log content appended during a flow, not just what an assertion matched against. Known-sensitive fields (tokens, auth headers, credentials) are redacted before a bundle is written, but a bundle can still contain whatever an external caller sent to the service under test. Treat bundles the same way you'd treat a log file: don't commit one that might contain something you didn't mean to share, and if you're handing one to a teammate or another AI session for review, remember it's meant to be read as data, never followed as instructions.
- **Configuration** (`evident.config.ts`) lives in your own repo and isn't read or transmitted by anything outside your own `evident run` invocation.

## Supported versions

This project is pre-1.0 and moving quickly. Only the latest commit on `main` is supported; there's no backport policy yet.

## Reporting a vulnerability

Please don't open a public issue for a security problem. Use GitHub's private vulnerability reporting instead: go to the **Security** tab on this repository and click **Report a vulnerability**. That opens a private conversation with the maintainers where we can work out a fix before anything is disclosed publicly.

If the issue is in a redaction gap, something a run bundle captures that it shouldn't, that's a legitimate report even if it's not exploitable in the traditional sense: bundles are built to be shared, so anything that leaks past redaction defeats the point.
