/**
 * Minimal, temporary way to run every currently-typechecking Flow before
 * the CLI (`evident run`, Layer 4) exists. Skips lifecycle.flow.ts and
 * concurrency.flow.ts — those use Stage 2 of defineFlow (hooks, fixtures,
 * execution mode, locks), not implemented yet. Run from this directory so
 * evident.config.ts's relative logPaths resolve:
 *
 *   node run.ts
 */
import { runFlow, type Flow } from 'evident';
import * as advancedFlows from './advanced.flow.ts';
import basicPass from './basic-pass.flow.ts';
import * as correlationFlows from './correlation.flow.ts';
import config from './evident.config.ts';
import * as safetyFlows from './safety.flow.ts';
import * as timeoutFlows from './timeout.flow.ts';

const flows: Flow[] = [
  basicPass,
  ...Object.values(timeoutFlows),
  ...Object.values(correlationFlows),
  ...Object.values(safetyFlows),
  ...Object.values(advancedFlows),
];

let passed = 0;
let failed = 0;

for (const flow of flows) {
  const start = Date.now();
  try {
    await runFlow(flow, config);
    console.log(`PASS  ${flow.name} (${(Date.now() - start).toString()}ms)`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL  ${flow.name} (${(Date.now() - start).toString()}ms)`);
    const label = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.log(`      ${label}`);
    failed += 1;
  }
}

console.log(`\n${passed.toString()} passed, ${failed.toString()} failed`);
process.exitCode = failed > 0 ? 1 : 0;
