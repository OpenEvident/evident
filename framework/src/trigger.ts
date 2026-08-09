import type { ResolvedService } from './config.js';

export interface TriggerRequest {
  method: string;
  path: string;
  body?: unknown;
}

export interface TriggerResponse<TBody = unknown> {
  status: number;
  body: TBody;
}

export interface Trigger {
  api<TBody = unknown>(service: string, request: TriggerRequest): Promise<TriggerResponse<TBody>>;
}

/** Thrown by {@link Trigger.api} when the service responds with a non-2xx status. */
export class TriggerError extends Error {
  readonly service: string;
  readonly status: number;
  readonly body: unknown;

  constructor(service: string, status: number, body: unknown) {
    super(`Trigger call to "${service}" failed with status ${status.toString()}.`);
    this.name = 'TriggerError';
    this.service = service;
    this.status = status;
    this.body = body;
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Builds a {@link Trigger} bound to `services`. `onFire` runs once, before
 * the first actual request goes out — the caller uses it to mark the
 * heuristic-correlation window's start (architecture.md §5: "the moment
 * the trigger actually fired", not when the Flow's `run()` started).
 */
export function createTrigger(
  services: Record<string, ResolvedService>,
  onFire: () => void | Promise<void>,
): Trigger {
  let fired = false;

  return {
    async api<TBody = unknown>(
      service: string,
      request: TriggerRequest,
    ): Promise<TriggerResponse<TBody>> {
      const resolved = services[service];
      if (!resolved) {
        throw new Error(
          `Unknown service "${service}" — not part of this Flow's declared services.`,
        );
      }

      if (!fired) {
        fired = true;
        await onFire();
      }

      const init: RequestInit = { method: request.method };
      if (request.body !== undefined) {
        init.headers = { 'Content-Type': 'application/json' };
        init.body = JSON.stringify(request.body);
      }

      const response = await fetch(`${resolved.baseUrl}${request.path}`, init);

      const body = await parseResponseBody(response);

      if (!response.ok) {
        throw new TriggerError(service, response.status, body);
      }

      return { status: response.status, body: body as TBody };
    },
  };
}
