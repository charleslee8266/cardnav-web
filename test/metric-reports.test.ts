import assert from 'node:assert/strict';
import test from 'node:test';
import { enqueueReport } from '../src/scripts/metric-reports.js';
import { readMetricEvents } from '../src/metric-request.js';
import { METRIC_BATCH_LIMIT, METRIC_FLUSH_INTERVAL_MS } from '../src/metric-batch.js';

test('reports batch on a timer, flush once on hide, and discard failed or overflowing telemetry', async context => {
  const documentEvents = new EventTarget();
  const windowEvents = new EventTarget();
  Object.defineProperty(documentEvents, 'hidden', { value: true });
  const priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: documentEvents });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: windowEvents });
  const requests: { url: unknown; events: unknown[] }[] = [];
  context.mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit) => {
    requests.push({ url, events: JSON.parse(String(init.body)).events });
    throw new Error('offline');
  });
  context.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    for (let i = 0; i < 20; i++) enqueueReport('/api/product-metrics', { productId: String(i) });
    enqueueReport('/api/product-metrics', { productId: '0' });
    enqueueReport('/api/search-terms', { term: 'example' });
    context.mock.timers.tick(METRIC_FLUSH_INTERVAL_MS - 1);
    assert.equal(requests.length, 0);
    context.mock.timers.tick(1);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].events.length, 20);
    assert.equal(requests[1].events.length, 1);
    await Promise.resolve();
    context.mock.timers.tick(METRIC_FLUSH_INTERVAL_MS);
    assert.equal(requests.length, 2, 'failed batches are not retried');
    for (let i = 0; i < METRIC_BATCH_LIMIT + 10; i++) enqueueReport('/api/events', { subjectId: String(i) });
    assert.equal(requests.length, 2, 'overflow must not cause a burst of immediate requests');
    documentEvents.dispatchEvent(new Event('visibilitychange'));
    windowEvents.dispatchEvent(new Event('pagehide'));
    assert.equal(requests.length, 3);
    assert.equal(requests[2].events.length, METRIC_BATCH_LIMIT);
    context.mock.timers.tick(METRIC_FLUSH_INTERVAL_MS);
    assert.equal(requests.length, 3);
    enqueueReport('/api/search-terms', { term: '字'.repeat(20_000) });
    windowEvents.dispatchEvent(new Event('pagehide'));
    assert.equal(requests.length, 3, 'oversized UTF-8 payloads are dropped');
  } finally {
    if (priorDocument) Object.defineProperty(globalThis, 'document', priorDocument);
    else Reflect.deleteProperty(globalThis, 'document');
    if (priorWindow) Object.defineProperty(globalThis, 'window', priorWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('report endpoints accept bounded batches and cached single-event clients', async () => {
  const read = (body: unknown) => readMetricEvents(new Request('http://localhost/api/events', {
    method: 'POST', body: JSON.stringify(body),
  }));
  assert.deepEqual(await read({ subjectId: 'a' }), [{ subjectId: 'a' }]);
  assert.deepEqual(await read({ events: [{ subjectId: 'a' }, { subjectId: 'b' }] }), [{ subjectId: 'a' }, { subjectId: 'b' }]);
  for (const value of [null, [], { events: [] }, { events: [null] }, { events: Array(51).fill({}) }, { text: '字'.repeat(20_000) }]) {
    assert.equal(await read(value), null);
  }
});
