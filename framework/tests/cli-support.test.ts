import { describe, expect, it } from 'vitest';
import {
  checkSafetyGate,
  collectFlows,
  determineExitCode,
  formatBundleLine,
  formatSkippedLine,
  formatSummary,
  isFlow,
  resolveRetentionDays,
  selectFlows,
} from '../src/cli-support.js';
import { DEFAULT_RETENTION_DAYS } from '../src/run/retention.js';
import { defineFlow, type Flow } from '../src/flow/define-flow.js';
import type { RunBundle } from '../src/run/run-bundle.js';

function flow(name: string, overrides: Partial<Flow> = {}): Flow {
  return defineFlow({
    name,
    services: ['caller-service'],
    safety: 'safe',
    correlation: 'heuristic',
    async run() {
      // no-op: only static metadata matters for these tests
    },
    ...overrides,
  });
}

function bundle(outcome: RunBundle['outcome'], name = 'a-flow'): RunBundle {
  return {
    schemaVersion: 1,
    runId: 'run-1',
    flow: { name, services: ['caller-service'], safety: 'safe', correlation: 'heuristic' },
    target: 'local',
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:00:01.500Z',
    outcome,
    triggers: [],
    assertions: [],
    evidence: {},
  };
}

describe('isFlow', () => {
  it('accepts a real Flow', () => {
    expect(isFlow(flow('x'))).toBe(true);
  });

  it('rejects primitives, null, and non-Flow-shaped objects', () => {
    expect(isFlow('flow')).toBe(false);
    expect(isFlow(null)).toBe(false);
    expect(isFlow(undefined)).toBe(false);
    expect(isFlow({ name: 'x' })).toBe(false);
    expect(isFlow({ name: 'x', services: [] })).toBe(false);
  });
});

describe('collectFlows', () => {
  it('picks Flow-shaped exports and ignores everything else, keyed by export name', () => {
    const moduleExports = {
      default: flow('default-flow'),
      namedOne: flow('named-one'),
      VERSION: '1.0.0',
      helper: () => 'not a flow',
    };

    const collected = collectFlows(moduleExports);

    expect([...collected.keys()].sort()).toEqual(['default', 'namedOne']);
    expect(collected.get('namedOne')?.name).toBe('named-one');
  });
});

describe('selectFlows', () => {
  it('returns every collected Flow when no name filter is given', () => {
    const all = collectFlows({ a: flow('a'), b: flow('b') });
    const result = selectFlows(all);
    expect(result.flows).toHaveLength(2);
    expect(result.error).toBeUndefined();
  });

  it('returns just the named Flow, matched by export identifier', () => {
    const all = collectFlows({
      timeoutSlow: flow('timeout-slow'),
      timeoutFail: flow('timeout-fail'),
    });
    const result = selectFlows(all, 'timeoutSlow');
    expect(result.flows).toHaveLength(1);
    expect(result.flows[0]?.name).toBe('timeout-slow');
  });

  it('errors with the available names when the requested name is not found', () => {
    const all = collectFlows({ a: flow('a'), b: flow('b') });
    const result = selectFlows(all, 'nope');
    expect(result.flows).toEqual([]);
    expect(result.error).toContain('nope');
    expect(result.error).toContain('a, b');
  });
});

describe('checkSafetyGate', () => {
  it('allows a run with no ask-first Flows regardless of --confirm', () => {
    const result = checkSafetyGate([flow('a', { safety: 'safe' })], false);
    expect(result).toEqual({ allowed: true, blockers: [] });
  });

  it('refuses the whole invocation if any Flow is ask-first and --confirm was not passed', () => {
    const flows = [flow('safe-one'), flow('risky', { safety: 'ask-first' })];
    const result = checkSafetyGate(flows, false);
    expect(result.allowed).toBe(false);
    expect(result.blockers).toEqual(['risky']);
  });

  it('allows the run when ask-first Flows are present but --confirm was passed', () => {
    const result = checkSafetyGate([flow('risky', { safety: 'ask-first' })], true);
    expect(result.allowed).toBe(true);
  });
});

describe('determineExitCode', () => {
  it('returns 0 when every bundle passed', () => {
    expect(determineExitCode([bundle('pass'), bundle('pass-after-retry')])).toBe(0);
  });

  it('returns 1 when any bundle failed', () => {
    expect(determineExitCode([bundle('pass'), bundle('fail')])).toBe(1);
  });

  it('returns 0 for an empty bundle list', () => {
    expect(determineExitCode([])).toBe(0);
  });
});

describe('formatBundleLine', () => {
  it('labels a plain pass', () => {
    expect(formatBundleLine(bundle('pass', 'basic-pass'), '/runs/1.json')).toBe(
      'PASS  basic-pass (1500ms)  /runs/1.json',
    );
  });

  it('labels a pass-after-retry distinctly from a plain pass', () => {
    expect(formatBundleLine(bundle('pass-after-retry', 'retried'), '/runs/2.json')).toContain(
      'PASS (after retry)',
    );
  });

  it('labels a failure', () => {
    expect(formatBundleLine(bundle('fail', 'broken'), '/runs/3.json')).toContain('FAIL');
  });
});

describe('formatSkippedLine and formatSummary', () => {
  it('formats a skip reason', () => {
    expect(formatSkippedLine('flaky-flow', 'marked skip')).toBe('SKIP  flaky-flow — marked skip');
  });

  it('summarizes passed/failed without mentioning skipped when there are none', () => {
    expect(formatSummary([bundle('pass'), bundle('fail')], 0)).toBe('1 passed, 1 failed');
  });

  it('includes skipped count when present', () => {
    expect(formatSummary([bundle('pass')], 2)).toBe('1 passed, 0 failed, 2 skipped');
  });
});

describe('resolveRetentionDays', () => {
  it('falls back to the framework default when neither CLI flag nor config is set', () => {
    expect(resolveRetentionDays(undefined, undefined)).toEqual({
      retentionDays: DEFAULT_RETENTION_DAYS,
    });
  });

  it('uses the config value when no CLI flag is given', () => {
    expect(resolveRetentionDays(undefined, 30)).toEqual({ retentionDays: 30 });
  });

  it('uses false (disabled) from config when no CLI flag is given', () => {
    expect(resolveRetentionDays(undefined, false)).toEqual({ retentionDays: false });
  });

  it('CLI flag overrides the config value', () => {
    expect(resolveRetentionDays('7', 30)).toEqual({ retentionDays: 7 });
  });

  it('falls back to the default and reports an error for a non-numeric CLI value', () => {
    const result = resolveRetentionDays('not-a-number', 30);
    expect(result.retentionDays).toBe(DEFAULT_RETENTION_DAYS);
    expect(result.error).toContain('not-a-number');
  });

  it('falls back to the default and reports an error for a negative CLI value', () => {
    const result = resolveRetentionDays('-5', 30);
    expect(result.retentionDays).toBe(DEFAULT_RETENTION_DAYS);
    expect(result.error).toContain('-5');
  });

  it('accepts 0 from the CLI as a valid (immediate-prune) value', () => {
    expect(resolveRetentionDays('0', 30)).toEqual({ retentionDays: 0 });
  });
});
