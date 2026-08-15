/**
 * Local only (docs/architecture.md §9) — no "deployed" targets here yet.
 * All three services default to heuristic correlation since none run with
 * the OTel Java agent attached (examples/services/README.md never wires
 * it in by default) — every event they log is structured JSON via MDC,
 * so heuristic mode resolves via the `structured-field` rung, not plain
 * substring, without any extra setup.
 */
import type { EvidentConfig } from 'evident';

export default {
  defaultTarget: 'local',
  /**
   * Matches the timing tier most calls across this suite already used
   * (dispatch/sync/publish steps waiting on a downstream service hop). A
   * faster tier exists too (import/attach acknowledgements) — those call
   * sites still pass their own `{ expectBy: '1s', timeout: '5s' }`, which
   * wins over this default per call, per field.
   */
  defaultPollOptions: { expectBy: '2s', timeout: '10s' },
  services: {
    'bulk-import-service': {
      local: {
        baseUrl: 'http://localhost:8083',
        logPath: '../services/bulk-import-service/logs/bulk-import-service.log',
        correlation: 'heuristic',
      },
    },
    'menu-service': {
      local: {
        baseUrl: 'http://localhost:8084',
        logPath: '../services/menu-service/logs/menu-service.log',
        correlation: 'heuristic',
      },
    },
    'publishing-service': {
      local: {
        baseUrl: 'http://localhost:8085',
        logPath: '../services/publishing-service/logs/publishing-service.log',
        correlation: 'heuristic',
      },
    },
  },
} satisfies EvidentConfig;
