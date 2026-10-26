/*
文件说明: 缓冲并批量上报公开页面指标，支持外跳前立即发送。
*/
import { METRIC_BATCH_LIMIT, METRIC_BATCH_BYTES, METRIC_FLUSH_INTERVAL_MS, packMetricEvents } from '../metric-batch.js';

type ReportEndpoint = '/api/product-metrics' | '/api/product-clicks' | '/api/search-terms' | '/api/events';
const pending: { endpoint: ReportEndpoint; payload: Record<string, unknown> }[] = [];
const pendingKeys = new Set<string>();
let bytes = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let listening = false;

/** Best-effort telemetry: bounded page memory, no persistence or retries. */
export function enqueueReport(endpoint: ReportEndpoint, payload: Record<string, unknown>): void {
  const serialized = JSON.stringify(payload);
  const key = `${endpoint}:${serialized}`;
  if (pendingKeys.has(key)) return;
  const size = new TextEncoder().encode(serialized).byteLength + 1;
  if (size > METRIC_BATCH_BYTES - 100) return;
  if (pending.length >= METRIC_BATCH_LIMIT || bytes + size > METRIC_BATCH_BYTES - 100) {
    if (!payload.eventId) return;
    flushReports();
  }
  pendingKeys.add(key);
  pending.push({ endpoint, payload });
  bytes += size;
  if (!listening) {
    listening = true;
    document.addEventListener('visibilitychange', () => { if (document.hidden) flushReports(); });
    window.addEventListener('pagehide', flushReports);
  }
  timer ??= setTimeout(flushReports, METRIC_FLUSH_INTERVAL_MS);
}

export function flushReports(): void {
  clearTimeout(timer);
  timer = undefined;
  const batch = pending.splice(0);
  pendingKeys.clear();
  bytes = 0;
  const groups = new Map<string, { endpoint: ReportEndpoint; events: Record<string, unknown>[] }>();
  for (const { endpoint, payload } of batch) {
    const key = JSON.stringify([endpoint, payload.visitorId]);
    if (!groups.has(key)) groups.set(key, { endpoint, events: [] });
    groups.get(key)!.events.push(payload);
  }
  for (const { endpoint, events } of groups.values()) {
    const idField = endpoint === '/api/events' ? 'subjectId'
      : endpoint === '/api/search-terms' || events.some(event => event.eventId) ? undefined : 'productId';
    // Clear before sending so visibilitychange + pagehide cannot send twice.
    void fetch(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(packMetricEvents(events, idField)), keepalive: true,
      signal: AbortSignal.timeout(10_000),
    }).catch(() => { /* Approximate statistics may be lost offline. */ });
  }
}
