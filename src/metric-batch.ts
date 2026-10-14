/** Bounds shared by the browser queue and reporting endpoints. */
export const METRIC_BATCH_LIMIT = 50;
export const METRIC_BATCH_BYTES = 48_000;
export const METRIC_FLUSH_INTERVAL_MS = 30_000;

export type MetricEvent = Record<string, unknown>;
export type MetricIdField = 'productId' | 'subjectId';

/** Events in a request share a visitor; adjacent identical contexts share an ID list. */
export function packMetricEvents(events: MetricEvent[], idField?: MetricIdField): MetricEvent {
  const visitorId = events[0]?.visitorId;
  if (events.some(event => event.visitorId !== visitorId)) throw new Error('Mixed metric visitors');
  const items = events.map(({ visitorId: _visitorId, ...event }) => event);
  if (!idField) return { ...(visitorId === undefined ? {} : { visitorId }), events: items };
  const groups: (MetricEvent & { ids: unknown[] })[] = [];
  let previousKey: string | undefined;
  for (const item of items) {
    const { [idField]: id, ...context } = item;
    const key = JSON.stringify(context);
    // Preserve event order: the first event determines impression attribution.
    if (key !== previousKey) groups.push({ ...context, ids: [] });
    groups[groups.length - 1].ids.push(id);
    previousKey = key;
  }
  return { visitorId, groups };
}
