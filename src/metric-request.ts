import { METRIC_BATCH_BYTES, METRIC_BATCH_LIMIT, type MetricIdField } from './metric-batch.js';

/** Accept single events from already-open/cached pages during rollout. */
export async function readMetricEvents(request: Request, idField?: MetricIdField): Promise<Record<string, unknown>[] | null> {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > METRIC_BATCH_BYTES) return null;
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return null; }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const envelope = body as Record<string, unknown>;
  if ('groups' in envelope) {
    if (!idField || typeof envelope.visitorId !== 'string' || 'events' in envelope
      || !Array.isArray(envelope.groups) || !envelope.groups.length
      || envelope.groups.length > METRIC_BATCH_LIMIT) return null;
    const events: Record<string, unknown>[] = [];
    for (const group of envelope.groups) {
      if (!group || typeof group !== 'object' || Array.isArray(group)) return null;
      const { ids, ...context } = group;
      if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string')
        || events.length + ids.length > METRIC_BATCH_LIMIT
        || 'visitorId' in context || idField in context) return null;
      for (const id of ids) events.push({ ...context, [idField]: id, visitorId: envelope.visitorId });
    }
    return events;
  }
  // Rollout compatibility: already-open pages send individual or ungrouped events.
  const events = 'events' in envelope ? envelope.events : [envelope];
  if (!Array.isArray(events) || !events.length || events.length > METRIC_BATCH_LIMIT
    || events.some(event => !event || typeof event !== 'object' || Array.isArray(event))) return null;
  if ('events' in envelope && 'visitorId' in envelope) {
    if (typeof envelope.visitorId !== 'string' || events.some(event => 'visitorId' in event)) return null;
    return events.map(event => ({ ...event, visitorId: envelope.visitorId }));
  }
  return events;
}
