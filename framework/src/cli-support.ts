import type { Flow } from './flow/define-flow.js';
import { DEFAULT_RETENTION_DAYS } from './run/retention.js';
import type { RunBundle } from './run/run-bundle.js';

export function isFlow(value: unknown): value is Flow {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === 'string' &&
    Array.isArray(candidate.services) &&
    typeof candidate.run === 'function'
  );
}

/** Picks out every exported Flow from a `.flow.ts` module's namespace object, keyed by its export identifier. */
export function collectFlows(moduleExports: Record<string, unknown>): Map<string, Flow> {
  const flows = new Map<string, Flow>();
  for (const [key, value] of Object.entries(moduleExports)) {
    if (isFlow(value)) {
      flows.set(key, value);
    }
  }
  return flows;
}

export interface SelectFlowsResult {
  flows: Flow[];
  error?: string;
}

/** Resolves Open Branch #6 (examples/flows/README.md) — `--name` addresses one Flow inside a multi-export file, by its export identifier. */
export function selectFlows(allFlows: Map<string, Flow>, name?: string): SelectFlowsResult {
  if (!name) {
    return { flows: [...allFlows.values()] };
  }
  const flow = allFlows.get(name);
  if (!flow) {
    const available = [...allFlows.keys()].join(', ') || '(none)';
    return {
      flows: [],
      error: `No exported Flow named "${name}" in this file. Available: ${available}.`,
    };
  }
  return { flows: [flow] };
}

export interface SafetyGateResult {
  allowed: boolean;
  blockers: string[];
}

/**
 * flow-model.md §9.2: if any targeted Flow is `safety: 'ask-first'` and
 * `--confirm` wasn't passed, refuse the whole invocation — never a silent
 * partial run of just the safe ones.
 */
export function checkSafetyGate(flows: readonly Flow[], confirmed: boolean): SafetyGateResult {
  const blockers = flows.filter((flow) => flow.safety === 'ask-first').map((flow) => flow.name);
  if (blockers.length === 0 || confirmed) {
    return { allowed: true, blockers: [] };
  }
  return { allowed: false, blockers };
}

/** Decision 16: exit 0 only if every assertion passed (slow-but-passed/pass-after-retry still 0); exit 1 on any failure. */
export function determineExitCode(bundles: readonly RunBundle[]): 0 | 1 {
  return bundles.some((bundle) => bundle.outcome === 'fail') ? 1 : 0;
}

function statusLabel(outcome: RunBundle['outcome']): string {
  if (outcome === 'fail') {
    return 'FAIL';
  }
  if (outcome === 'pass-after-retry') {
    return 'PASS (after retry)';
  }
  return 'PASS';
}

export function formatBundleLine(bundle: RunBundle, bundlePath: string): string {
  const durationMs = Date.parse(bundle.finishedAt) - Date.parse(bundle.startedAt);
  return `${statusLabel(bundle.outcome)}  ${bundle.flow.name} (${durationMs.toString()}ms)  ${bundlePath}`;
}

export function formatSkippedLine(name: string, reason: string): string {
  return `SKIP  ${name} — ${reason}`;
}

export interface RetentionResolution {
  retentionDays: number | false;
  error?: string;
}

/**
 * `--retention-days` (if given) overrides `EvidentConfig.runRetentionDays`;
 * both absent falls back to {@link DEFAULT_RETENTION_DAYS} — same
 * precedence pattern as `--target`/`defaultTarget`.
 */
export function resolveRetentionDays(
  cliValue: string | undefined,
  configValue: number | false | undefined,
): RetentionResolution {
  if (cliValue !== undefined) {
    const parsed = Number(cliValue);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return {
        retentionDays: DEFAULT_RETENTION_DAYS,
        error: `--retention-days must be a non-negative number, got "${cliValue}".`,
      };
    }
    return { retentionDays: parsed };
  }
  if (configValue !== undefined) {
    return { retentionDays: configValue };
  }
  return { retentionDays: DEFAULT_RETENTION_DAYS };
}

export function formatSummary(bundles: readonly RunBundle[], skippedCount: number): string {
  const passed = bundles.filter((bundle) => bundle.outcome !== 'fail').length;
  const failed = bundles.filter((bundle) => bundle.outcome === 'fail').length;
  const parts = [`${passed.toString()} passed`, `${failed.toString()} failed`];
  if (skippedCount > 0) {
    parts.push(`${skippedCount.toString()} skipped`);
  }
  return parts.join(', ');
}
