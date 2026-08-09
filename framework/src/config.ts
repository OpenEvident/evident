export type CorrelationMode = 'trace' | 'heuristic';

export interface ServiceTargetConfig {
  baseUrl: string;
  logPath: string;
  correlation: CorrelationMode;
}

export interface EvidentConfig {
  defaultTarget: string;
  services: Record<string, Record<string, ServiceTargetConfig>>;
}

export interface ResolvedService extends ServiceTargetConfig {
  name: string;
}

/**
 * Resolves each of `serviceNames` against `config` for `target` (defaults
 * to `config.defaultTarget`).
 *
 * @throws {Error} If a named service isn't declared in `config.services`,
 *   or has no configuration for the resolved target.
 */
export function resolveServices(
  config: EvidentConfig,
  serviceNames: readonly string[],
  target: string = config.defaultTarget,
): Record<string, ResolvedService> {
  const resolved: Record<string, ResolvedService> = {};

  for (const name of serviceNames) {
    const targets = config.services[name];
    if (!targets) {
      throw new Error(`Service "${name}" is not declared in evident.config.ts.`);
    }

    const targetConfig = targets[target];
    if (!targetConfig) {
      throw new Error(`Service "${name}" has no configuration for target "${target}".`);
    }

    resolved[name] = { name, ...targetConfig };
  }

  return resolved;
}
