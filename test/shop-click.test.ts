/*
文件说明: 验证点击上下文、会话、重复跳转、即时上报与服务端输入边界。
*/
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { ShopClickTracker } from '../src/scripts/ShopClickTracker.js';
import { parseShopClick } from '../src/shop-click.js';
import { enqueueReport } from '../src/scripts/metric-reports.js';

test('actual clicks retain search context, repeat clicks and shared sessions, and flush past queued exposures', async context => {
  const saved = new Map<string, PropertyDescriptor | undefined>();
  const globals = {
    document: new EventTarget(), window: new EventTarget(), location: { pathname: '/market' },
    localStorage: (() => { const values = new Map<string, string>(); return {
      getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value),
    }; })(),
  };
  for (const [key, value] of Object.entries(globals)) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  const reports: Record<string, unknown>[] = [];
  context.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const envelope = JSON.parse(String(init.body));
    reports.push(...(envelope.events || []).map((event: object) => ({ ...event, visitorId: envelope.visitorId })));
    return new Response(null, { status: 202 });
  });
  let now = Date.now();
  context.mock.method(Date, 'now', () => now);
  const visitor = randomUUID();
  const row = { dataset: { clickPosition: '8', clickPartner: '1', clickSupporter: '1', pinKind: '', productMetricDisplayType: 'partner' } };
  const target = { dataset: { productClickId: '1'.repeat(32), productRiskShown: '1' }, closest: () => row } as unknown as HTMLElement;
  try {
    const tracker = new ShopClickTracker(visitor);
    tracker.updateContext({ q: 'Claude Pro', platform: ['ldxp', 'other'], priceMax: '100' });
    for (let i = 0; i < 50; i++) enqueueReport('/api/product-metrics', { productId: String(i), visitorId: visitor });
    tracker.click(target);
    tracker.click(target);
    assert.equal(reports.length, 2);
    assert.deepEqual(reports[0].filters, { q: 'Claude Pro', platform: ['ldxp', 'other'], priceMax: '100' });
    assert.equal(reports[0].contextId, reports[1].contextId);
    assert.notEqual(reports[0].eventId, reports[1].eventId);
    assert.equal(reports[0].region, 'normal', 'partner identity does not imply a pinned placement');
    assert.equal(reports[0].riskDialogShown, true);
    assert.ok(parseShopClick(reports[0]));
    tracker.updateContext({ q: 'Gemini' });
    tracker.click(target);
    assert.notEqual(reports[0].contextId, reports[2].contextId);
    assert.equal(reports[0].sessionId, reports[2].sessionId);
    const secondPage = new ShopClickTracker(visitor);
    secondPage.click(target);
    assert.equal(reports[0].sessionId, reports[3].sessionId);
    now += 31 * 60_000;
    secondPage.click(target);
    assert.notEqual(reports[3].sessionId, reports[4].sessionId);
    for (const changes of [{ visitorId: 'bad' }, { filters: { token: 'secret' } }, { sourcePage: '/market?token=secret' }, { position: -1 }, { riskDialogShown: 'true' }]) {
      assert.equal(parseShopClick({ ...reports[0], ...changes }), null);
    }
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
