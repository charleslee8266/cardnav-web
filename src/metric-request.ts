import { METRIC_BATCH_BYTES, METRIC_BATCH_LIMIT } from './metric-batch.js';

/** Accept single events from already-open/cached pages during rollout. */
export async function readMetricEvents(request: Request): Promise<Record<string, unknown>[] | null> {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > METRIC_BATCH_BYTES) return null;
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return null; }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const events = 'events' in body ? body.events : [body];
  if (!Array.isArray(events) || !events.length || events.length > METRIC_BATCH_LIMIT
    || events.some(event => !event || typeof event !== 'object' || Array.isArray(event))) return null;
  return events;
}
