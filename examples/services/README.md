# Example services

Two minimal Spring Boot services that exist to be verified *against* —
not part of the published framework (`/framework`), not part of any real
product. They're the "system under test" the flow specs in `/examples`
point at, built to exercise every mechanism the correlation proof needs:
sync and async calls, configurable delay (pass / slow-flagged / fail /
timeout), trigger failure, and both correlation modes.

Spring Boot 4.1.0, Java 25, Maven — verified as current-stable at the time
these were scaffolded (see `docs/project-setup.md`'s decision log for the
verification standard this follows).

## Services

### `caller-service` (port 8081)

`POST /trigger`

```json
{
  "recordId": "abc-123",
  "delayMs": 500,
  "mode": "sync",
  "simulateFailure": false
}
```

- `mode: "sync"` — blocks on the call to `receiver-service`, returns `200`
  once it completes. Models a direct service-to-service REST call.
- `mode: "async"` — returns `202` immediately, calls `receiver-service` in
  the background. Models a callback-style flow — this is the shape that
  exercises the framework's `delay` option (don't start polling for
  evidence until the callback would realistically have happened).
- `simulateFailure: true` — returns `500` immediately without calling
  `receiver-service` at all. Models a trigger-call failure (Decision 19),
  distinct from an assertion failure.

### `receiver-service` (port 8082)

`POST /process`

```json
{ "recordId": "abc-123", "delayMs": 500 }
```

Sleeps `delayMs` milliseconds, then logs `processed record {recordId}` and
returns `200`. Varying `delayMs` against a flow's `expectBy`/`timeout` is
what produces pass / slow-flagged / fail scenarios — no separate service
variants needed.

## Running locally

```bash
cd caller-service && mvn spring-boot:run
cd receiver-service && mvn spring-boot:run
```

Each writes its own log file to `logs/<service-name>.log` (relative to
that service's directory), in addition to console output — this is the
evidence source the framework's `evidence.logs()` collector reads for
heuristic-mode correlation (Decision 18): it searches for the exact
`recordId` in log lines timestamped after the trigger fired.

## Correlation modes

**Heuristic mode** works out of the box — no setup. Both services already
log the `recordId`, which is what `matchOn` searches for.

**Trace mode** requires attaching the OpenTelemetry Java agent (Decision 2)
to both services' JVM args, e.g.:

```bash
java -javaagent:/path/to/opentelemetry-javaagent.jar -jar target/caller-service-0.1.0.jar
```

Not wired into these services by default — this is a launch-time flag, not
an application dependency, and it's the next thing to actually exercise
once the framework's evidence collectors exist to consume it. Not needed
for the initial compile/run verification.
