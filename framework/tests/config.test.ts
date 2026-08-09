import { describe, expect, it } from 'vitest';
import { resolveServices, type EvidentConfig } from '../src/config.js';

const config: EvidentConfig = {
  defaultTarget: 'local',
  services: {
    'caller-service': {
      local: {
        baseUrl: 'http://localhost:8081',
        logPath: '/logs/caller.log',
        correlation: 'heuristic',
      },
    },
    'receiver-service': {
      local: {
        baseUrl: 'http://localhost:8082',
        logPath: '/logs/receiver.log',
        correlation: 'heuristic',
      },
    },
  },
};

describe('resolveServices', () => {
  it('resolves declared services for the default target', () => {
    const resolved = resolveServices(config, ['caller-service', 'receiver-service']);

    expect(resolved['caller-service']).toEqual({
      name: 'caller-service',
      baseUrl: 'http://localhost:8081',
      logPath: '/logs/caller.log',
      correlation: 'heuristic',
    });
  });

  it('resolves for an explicit target', () => {
    const multiTarget: EvidentConfig = {
      defaultTarget: 'local',
      services: {
        'caller-service': {
          local: {
            baseUrl: 'http://localhost:8081',
            logPath: '/logs/caller.log',
            correlation: 'heuristic',
          },
          staging: {
            baseUrl: 'https://staging.example.com',
            logPath: '/logs/caller.log',
            correlation: 'trace',
          },
        },
      },
    };

    const resolved = resolveServices(multiTarget, ['caller-service'], 'staging');

    expect(resolved['caller-service']?.baseUrl).toBe('https://staging.example.com');
  });

  it('throws for a service not declared in config', () => {
    expect(() => resolveServices(config, ['unknown-service'])).toThrow(/not declared/);
  });

  it('throws when a declared service has no configuration for the target', () => {
    expect(() => resolveServices(config, ['caller-service'], 'staging')).toThrow(
      /no configuration for target/,
    );
  });
});
