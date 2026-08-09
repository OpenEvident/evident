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

Within heuristic mode, the framework's evidence collector actually tries
three progressively stronger ways to find a match (architecture.md §5),
and both services deliberately demonstrate a different rung:

- **`caller-service`** logs plain text (its original `application.yml`
  pattern, unchanged) — every match against it goes through the substring
  rung. This is the zero-setup floor every service gets for free.
- **`receiver-service`** turns on Spring Boot's native structured JSON
  logging (`logging.structured.format.file: ecs`) and stamps `recordId`
  into SLF4J's MDC for the duration of each request
  (`ProcessController.process()`, `MDC.put`/`MDC.remove`) — no new
  dependency, just the two changes below. Because Spring Boot includes
  every MDC key as a top-level JSON field, `matchOn: [{ field: 'recordId',
  value: recordId }]` against its logs resolves via an exact structured
  lookup instead of a text scan, and the run bundle records
  `matchedVia: 'structured-field'` for it.

The recipe, if you want to add this to a service of your own:

```yaml
# application.yml
logging:
  structured:
    format:
      file: ecs # or 'gelf' / 'logstash'
```

```java
// at the request/message boundary
MDC.put("recordId", recordId);
try {
  // ... handle the request ...
} finally {
  MDC.remove("recordId");
}
```

Nothing in `matchOn`/`waitFor`'s call shape has to change either way — the
stronger match happens automatically the moment a service's log lines
start parsing as JSON with the declared field present. `advanced.flow.ts`'s
`asyncCallback` flow exercises both rungs side by side in a single run,
since it asserts against `caller-service` (plain text) and
`receiver-service` (structured) in sequence.

**Trace mode** requires attaching the OpenTelemetry Java agent (Decision 2)
to both services' JVM args, e.g.:

```bash
java -javaagent:/path/to/opentelemetry-javaagent.jar -jar target/caller-service-0.1.0.jar
```

Not wired into these services by default — this is a launch-time flag, not
an application dependency, and it's the next thing to actually exercise
once the framework's evidence collectors exist to consume it. Not needed
for the initial compile/run verification.
