import { resolveServices, type EvidentConfig } from './config.js';
import type { Flow } from './define-flow.js';
import { createEvidence, logFileSize } from './evidence.js';
import { poll } from './poll.js';
import { createTrigger } from './trigger.js';

export interface RunFlowOptions {
  target?: string;
}

/**
 * Resolves `flow`'s declared services against `config`, wires up a Trigger
 * and Evidence collector that share one fire-offset map — captured the
 * moment the Trigger actually fires, not when this function is called —
 * and runs the Flow against them.
 */
export async function runFlow(
  flow: Flow,
  config: EvidentConfig,
  options: RunFlowOptions = {},
): Promise<void> {
  const services = resolveServices(config, flow.services, options.target);
  const fireOffsets = new Map<string, number>();

  const trigger = createTrigger(services, async () => {
    await Promise.all(
      Object.values(services).map(async (service) => {
        fireOffsets.set(service.name, await logFileSize(service.logPath));
      }),
    );
  });

  const evidence = createEvidence(services, fireOffsets);

  await flow.run({ trigger, evidence, poll });
}
