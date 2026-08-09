#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Command } from 'commander';
import {
  checkSafetyGate,
  collectFlows,
  determineExitCode,
  formatBundleLine,
  formatSkippedLine,
  formatSummary,
  resolveRetentionDays,
  selectFlows,
} from './cli-support.js';
import { resolveServices, type EvidentConfig, type ResolvedService } from './config.js';
import { beginSuiteRegistration, endSuiteRegistration } from './flow/suite-context.js';
import { pruneOldRunBundles } from './run/retention.js';
import { runSuite } from './run/run-suite.js';

interface RunCommandOptions {
  config: string;
  target?: string;
  name?: string;
  confirm: boolean;
  retentionDays?: string;
}

/**
 * Owner-only. Real protection on POSIX (Linux/macOS dev machines, Linux CI
 * runners) — Node's `mode` maps to POSIX permission bits, which
 * Windows/NTFS doesn't have; on Windows this is close to a no-op (access
 * there is governed by ACLs, not these bits). Bundles can carry real
 * business data even after redaction, so this is worth doing where it
 * works rather than skipping it because it doesn't work everywhere. Only
 * applies to directories/files created from here on — `mkdir` doesn't
 * retroactively tighten an already-existing directory.
 */
const RUN_BUNDLE_DIR_MODE = 0o700;
const RUN_BUNDLE_FILE_MODE = 0o600;

async function importDefault<T>(path: string, label: string): Promise<T> {
  const absolute = resolvePath(process.cwd(), path);
  const moduleUrl = pathToFileURL(absolute).href;
  const imported = (await import(moduleUrl)) as { default?: T };
  if (imported.default === undefined) {
    throw new Error(`${label} at ${absolute} has no default export.`);
  }
  return imported.default;
}

function isConfigShaped(value: unknown): value is EvidentConfig {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.defaultTarget === 'string' &&
    typeof candidate.services === 'object' &&
    candidate.services !== null
  );
}

async function isReachable(service: ResolvedService, timeoutMs = 2000): Promise<boolean> {
  try {
    await fetch(service.baseUrl, { signal: AbortSignal.timeout(timeoutMs) });
    return true;
  } catch {
    return false;
  }
}

/** flow-model.md §10.5: confirm every declared service actually responds before triggering anything — fail fast, not a confusing mid-run failure. */
async function findUnreachableServices(
  services: Record<string, ResolvedService>,
): Promise<ResolvedService[]> {
  const checked = await Promise.all(
    Object.values(services).map(async (service) => ({
      service,
      reachable: await isReachable(service),
    })),
  );
  return checked.filter((entry) => !entry.reachable).map((entry) => entry.service);
}

async function runCommand(file: string, options: RunCommandOptions): Promise<void> {
  const config = await importDefault<EvidentConfig>(options.config, 'Config');
  if (!isConfigShaped(config)) {
    console.error(
      `Config at ${options.config} doesn't look like an EvidentConfig (missing defaultTarget/services).`,
    );
    process.exitCode = 1;
    return;
  }

  const flowFileUrl = pathToFileURL(resolvePath(process.cwd(), file)).href;

  beginSuiteRegistration();
  const moduleExports = (await import(flowFileUrl)) as Record<string, unknown>;
  const registration = endSuiteRegistration();

  const selection = selectFlows(collectFlows(moduleExports), options.name);
  if (selection.error) {
    console.error(selection.error);
    process.exitCode = 1;
    return;
  }
  if (selection.flows.length === 0) {
    console.error(`No Flows found in ${file}.`);
    process.exitCode = 1;
    return;
  }

  const gate = checkSafetyGate(selection.flows, options.confirm);
  if (!gate.allowed) {
    console.error(
      [
        'Refusing to run — the following Flow(s) are declared "ask-first" and --confirm was not passed:',
        ...gate.blockers.map((name) => `  - ${name}`),
        'Pass --confirm to run this invocation, or address the unconfirmed Flow(s) separately.',
      ].join('\n'),
    );
    process.exitCode = 1;
    return;
  }

  const target = options.target ?? config.defaultTarget;
  const allServiceNames = [...new Set(selection.flows.flatMap((flow) => flow.services))];
  const services = resolveServices(config, allServiceNames, target);

  const unreachable = await findUnreachableServices(services);
  if (unreachable.length > 0) {
    console.error(
      [
        `Service(s) unreachable at target "${target}":`,
        ...unreachable.map((service) => `  - ${service.name} (${service.baseUrl})`),
      ].join('\n'),
    );
    process.exitCode = 1;
    return;
  }

  const runOptions: Parameters<typeof runSuite>[3] = {};
  if (options.target !== undefined) {
    runOptions.target = options.target;
  }
  const result = await runSuite(selection.flows, registration, config, runOptions);

  const runsDir = resolvePath(process.cwd(), '.evident', 'runs');
  await mkdir(runsDir, { recursive: true, mode: RUN_BUNDLE_DIR_MODE });

  for (const bundle of result.bundles) {
    const bundlePath = resolvePath(runsDir, `${bundle.runId}.json`);
    await writeFile(bundlePath, JSON.stringify(bundle, null, 2), {
      encoding: 'utf8',
      mode: RUN_BUNDLE_FILE_MODE,
    });
    console.log(formatBundleLine(bundle, bundlePath));
  }
  for (const skipped of result.skipped) {
    console.log(formatSkippedLine(skipped.name, skipped.reason));
  }

  console.log(`\n${formatSummary(result.bundles, result.skipped.length)}`);

  const retention = resolveRetentionDays(options.retentionDays, config.runRetentionDays);
  if (retention.error) {
    console.error(retention.error);
  }
  const pruned = await pruneOldRunBundles(runsDir, retention.retentionDays);
  if (pruned.prunedCount > 0) {
    console.log(
      `Pruned ${pruned.prunedCount.toString()} run bundle(s) older than the retention window.`,
    );
  }

  process.exitCode = determineExitCode(result.bundles);
}

interface CleanCommandOptions {
  olderThan?: string;
}

async function cleanCommand(options: CleanCommandOptions): Promise<void> {
  const runsDir = resolvePath(process.cwd(), '.evident', 'runs');

  let retentionDays: number | false = 0;
  if (options.olderThan !== undefined) {
    const parsed = Number(options.olderThan);
    if (!Number.isFinite(parsed) || parsed < 0) {
      console.error(
        `--older-than must be a non-negative number of days, got "${options.olderThan}".`,
      );
      process.exitCode = 1;
      return;
    }
    retentionDays = parsed;
  }

  const result = await pruneOldRunBundles(runsDir, retentionDays);
  console.log(`Deleted ${result.prunedCount.toString()} run bundle(s).`);
}

const program = new Command();

program
  .name('evident')
  .description(
    'AI-driven multi-service verification framework — deterministic runner, no LLM inside.',
  );

program
  .command('run')
  .description(
    'Run every Flow in a .flow.ts file against the services declared in evident.config.ts.',
  )
  .argument('<file>', 'path to a .flow.ts file')
  .option('--config <path>', 'path to evident.config.ts', 'evident.config.ts')
  .option('--target <target>', "override the config's defaultTarget")
  .option('--name <flowName>', 'run only the named export from <file>')
  .option('--confirm', 'required to run any Flow declared safety: "ask-first"', false)
  .option(
    '--retention-days <days>',
    "override the config's runRetentionDays for this invocation (default: 14)",
  )
  .addHelpText(
    'after',
    '\nTrust note:\n' +
      '  <file> and the config file are executable TypeScript — evident run\n' +
      '  imports and runs them with full privileges, the same as running\n' +
      '  `node <file>` yourself (same model as playwright.config.ts,\n' +
      '  jest.config.js, and similar config-as-code files). Only run this\n' +
      '  against files you already trust.',
  )
  .action(async (file: string, cmdOptions: RunCommandOptions) => {
    await runCommand(file, cmdOptions);
  });

program
  .command('clean')
  .description('Delete run bundles from .evident/runs/.')
  .option(
    '--older-than <days>',
    'only delete bundles older than this many days (default: delete all)',
  )
  .action(async (cmdOptions: CleanCommandOptions) => {
    await cleanCommand(cmdOptions);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
