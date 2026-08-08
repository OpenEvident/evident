/**
 * Local only (docs/architecture.md §9) — no "deployed" targets
 * here yet. Both services default to heuristic correlation since neither
 * runs with the OTel Java agent attached by default; flip to 'trace'
 * per-service once the agent is attached for that run (see
 * examples/services/README.md).
 */
export default {
  defaultTarget: 'local',
  services: {
    'caller-service': {
      local: {
        baseUrl: 'http://localhost:8081',
        logPath: '../services/caller-service/logs/caller-service.log',
        correlation: 'heuristic',
      },
    },
    'receiver-service': {
      local: {
        baseUrl: 'http://localhost:8082',
        logPath: '../services/receiver-service/logs/receiver-service.log',
        correlation: 'heuristic',
      },
    },
  },
};
