import { randomUUID } from 'node:crypto';
import { resolveServices, type EvidentConfig } from '../config.js';
import { parseDuration } from '../evidence/duration.js';
import {
  captureEvidenceSnapshots,
  createEvidence,
  logFileSize,
  type EvidenceSnapshot,
} from '../evidence/evidence.js';
import { redactText } from '../evidence/redact.js';
import { createTrigger } from '../evidence/trigger.js';
import type { Flow, FlowContext } from '../flow/define-flow.js';
import { FixtureResolver } from '../flow/fixture-resolver.js';
import { recordingEvidence, recordingPoll, recordingTrigger } from './recording.js';
import type { AssertionRecord, RunBundle, TriggerRecord } from './run-bundle.js';

export interface RunFlowOptions {
  target?: string;
  /**
   * Shares Suite-scoped Fixtures across multiple `runFlow` calls — this is
   * how `runSuite` gets Suite-scoped Fixtures set up once and reused. Omit
   * for a standalone `runFlow` call; a fresh resolver is created (and its
   * own Suite-scoped Fixtures torn down) for that one call.
   */
  fixtureResolver?: FixtureResolver;
}

async function runWithFlowTimeout(
  flow: Flow,
  context: FlowContext<Record<string, unknown>>,
): Promise<void> {
  const timeoutLabel = flow.timeout;
  if (!timeoutLabel) {
    await flow.run(context);
    return;
  }

  const timeoutMs = parseDuration(timeoutLabel);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Flow "${flow.name}" exceeded its ${timeoutLabel} timeout.`));
    }, timeoutMs);
  });

  try {
    await Promise.race([flow.run(context), timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolves `flow`'s declared services against `config`, wires up a Trigger
 * and Evidence collector that share one fire-offset map, runs the Flow,
 * and returns a complete {@link RunBundle}.
 *
 * A Flow-level failure (a failed trigger call, assertion, or `timeout`
 * ceiling) is captured as `outcome: 'fail'` on the returned bundle, never
 * thrown — that's a normal, expected outcome, not a program error. An
 * infrastructure problem that prevents the run from starting at all (e.g.
 * an undeclared service in `config`) still throws immediately, before the
 * bundle is built.
 *
 * If `flow.retries` is set, a failing attempt is retried up to that many
 * additional times; an eventual pass is recorded as `pass-after-retry`,
 * never silently folded into a plain `pass`. Each attempt re-fires the
 * trigger from scratch (no partial-attempt cancellation — a `timeout`
 * ceiling stops *waiting* on an over-budget attempt, not the in-flight
 * work itself).
 */
export async function runFlow(
  flow: Flow,
  config: EvidentConfig,
  options: RunFlowOptions = {},
): Promise<RunBundle> {
  const target = options.target ?? config.defaultTarget;
  const services = resolveServices(config, flow.services, target);

  const resolver = options.fixtureResolver ?? new FixtureResolver();
  const ownsResolver = !options.fixtureResolver;

  const triggers: TriggerRecord[] = [];
  const assertions: AssertionRecord[] = [];
  const startedAt = new Date().toISOString();
  const maxAttempts = 1 + Math.max(flow.retries ?? 0, 0);

  let fireOffsets = new Map<string, number>();
  let error: { name: string; message: string } | undefined;
  let attemptsUsed = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attemptsUsed = attempt;
    fireOffsets = new Map<string, number>();

    const rawTrigger = createTrigger(services, async () => {
      await Promise.all(
        Object.values(services).map(async (service) => {
          fireOffsets.set(service.name, await logFileSize(service.logPath));
        }),
      );
    });
    const trigger = recordingTrigger(rawTrigger, (entry) => triggers.push(entry));

    const rawEvidence = createEvidence(services, fireOffsets);
    const evidence = recordingEvidence(rawEvidence, (entry) => assertions.push(entry));

    const poll = recordingPoll((entry) => assertions.push(entry));

    const { values: fixtures, teardown: teardownFlowFixtures } = await resolver.resolveForFlow(
      flow.fixtures ?? [],
    );

    try {
      await runWithFlowTimeout(flow, { trigger, evidence, poll, fixtures });
      error = undefined;
      break;
    } catch (caught) {
      error = {
        name: caught instanceof Error ? caught.name : 'Error',
        message: caught instanceof Error ? caught.message : String(caught),
      };
    } finally {
      await teardownFlowFixtures();
    }
  }

  if (ownsResolver) {
    await resolver.teardownSuiteScoped();
  }

  const finishedAt = new Date().toISOString();

  const rawSnapshots = await captureEvidenceSnapshots(services, fireOffsets);
  const evidenceSnapshots: Record<string, EvidenceSnapshot> = {};
  for (const [name, snapshot] of Object.entries(rawSnapshots)) {
    evidenceSnapshots[name] = { ...snapshot, raw: redactText(snapshot.raw) };
  }

  const outcome: RunBundle['outcome'] = error
    ? 'fail'
    : attemptsUsed > 1
      ? 'pass-after-retry'
      : 'pass';

  const bundle: RunBundle = {
    schemaVersion: 1,
    runId: randomUUID(),
    flow: {
      name: flow.name,
      services: flow.services,
      safety: flow.safety,
      correlation: flow.correlation,
    },
    target,
    startedAt,
    finishedAt,
    outcome,
    triggers,
    assertions,
    evidence: evidenceSnapshots,
  };

  if (error) {
    bundle.error = error;
  }

  return bundle;
}
