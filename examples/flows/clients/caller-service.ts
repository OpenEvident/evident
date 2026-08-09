/**
 * Typed wrapper around caller-service's endpoints — keeps the raw
 * path/method/body shape in one place instead of repeated across every
 * flow that triggers this service.
 */
import type { Trigger } from 'evident';

export interface TriggerRequestBody {
  recordId: string;
  delayMs: number;
  mode: 'sync' | 'async';
  simulateFailure: boolean;
}

export interface TriggerResponseBody {
  recordId: string;
  status: 'completed' | 'accepted' | 'failed';
}

export function triggerCaller(trigger: Trigger, body: TriggerRequestBody) {
  return trigger.api<TriggerResponseBody>('caller-service', {
    method: 'POST',
    path: '/trigger',
    body,
  });
}
