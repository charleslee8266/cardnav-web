import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFavoriteSnapshot } from '../src/shop-favorites.js';
import { POST } from '../src/pages/api/shop-favorites.js';
import { favoriteStorageKeys, syncShopFavorites, toggleShopFavorite } from '../src/scripts/shop-favorites.js';

const visitorId = '01234567-89ab-4cde-8fab-0123456789ab';

test('snapshot validation deduplicates IDs and rejects malformed or oversized collections', () => {
  const base = { visitorId, revision: 1, productIds: ['p2', 'p1', 'p1'], siteIds: [] };
  assert.deepEqual(parseFavoriteSnapshot(base)?.productIds, ['p1', 'p2']);
  assert.equal(parseFavoriteSnapshot({ ...base, revision: Number.MAX_SAFE_INTEGER + 1 }), null);
  assert.equal(parseFavoriteSnapshot({ ...base, visitorId: 'invalid' }), null);
  assert.equal(parseFavoriteSnapshot({ ...base, siteIds: Array(1001).fill('s') }), null);
  assert.equal(parseFavoriteSnapshot({ ...base, productKeys: [null] }), null);
});

test('endpoint rejects cross-site and oversized streaming requests before persistence', async () => {
  const url = new URL('https://example.test/api/shop-favorites');
  async function status(request: Request) { return (await POST({ request, url } as Parameters<typeof POST>[0])).status; }
  assert.equal(await status(new Request(url, { method: 'POST', headers: { origin: 'https://other.test' } })), 403);
  assert.equal(await status(new Request(url, { method: 'POST', headers: { origin: url.origin, 'content-type': 'text/plain' } })), 415);
  assert.equal(await status(new Request(url, { method: 'POST', headers: { origin: url.origin, 'content-type': 'application/json' }, body: 'x'.repeat(129 * 1024) })), 413);
  assert.equal(await status(new Request(url, { method: 'POST', headers: { origin: url.origin, 'content-type': 'application/json' }, body: '{}' })), 400);
});

test('browser snapshots include unloaded favorites, retry failures, deduplicate daily visits and clear removals', async t => {
  const storage = new Map<string, string>();
  const globals = ['localStorage', 'navigator', 'window', 'fetch'] as const;
  const descriptors = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => {
    for (const key of globals) {
      const descriptor = descriptors.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
  });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  } });
  const queues = new Map<string, Promise<unknown>>();
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: {
    request(name: string, optionsOrCallback: unknown, callback?: (lock: object | null) => unknown) {
      const action = (callback ?? optionsOrCallback) as (lock: object | null) => unknown;
      const prior = queues.get(name);
      if (callback && prior) return Promise.resolve(action(null));
      const next = Promise.resolve(prior).then(() => action({ name }));
      queues.set(name, next);
      void next.finally(() => { if (queues.get(name) === next) queues.delete(name); });
      return next;
    },
  } } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  let ok = false;
  const requests: Record<string, unknown>[] = [];
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async (_url: string, init: RequestInit) => {
    requests.push(JSON.parse(String(init.body)));
    return { ok };
  } });
  await syncShopFavorites();
  assert.equal(requests.length, 0, 'never-favorited browsers do not upload');
  storage.set('cardnav.visitorId', visitorId);
  storage.set(favoriteStorageKeys.product, JSON.stringify(['Unloaded merchant#Unloaded product']));
  await toggleShopFavorite('product', 'Visible merchant#Visible product', 'product-stable-id');
  await syncShopFavorites();
  assert.deepEqual(requests[0]?.productKeys, ['Unloaded merchant#Unloaded product']);
  assert.deepEqual(requests[0]?.productIds, ['product-stable-id']);
  assert.equal(requests[0]?.visitorId, visitorId);
  assert.equal(JSON.parse(storage.get('cardnav.shopFavoriteSync')!).syncedDay, undefined);
  ok = true;
  await syncShopFavorites();
  assert.equal(requests[0]?.revision, requests[1]?.revision, 'retry uses the pending revision');
  await syncShopFavorites();
  assert.equal(requests.length, 2, 'successful daily snapshot is not repeated');
  await Promise.all([
    toggleShopFavorite('product', 'Visible merchant#Visible product', 'product-stable-id'),
    toggleShopFavorite('product', 'Unloaded merchant#Unloaded product'),
  ]);
  await syncShopFavorites();
  assert.deepEqual(requests[2]?.productKeys, []);
  assert.deepEqual(requests[2]?.productIds, []);
  assert.ok(Number(requests[2]?.revision) > Number(requests[1]?.revision));
  const state = JSON.parse(storage.get('cardnav.shopFavoriteSync')!);
  storage.set('cardnav.shopFavoriteSync', JSON.stringify({ ...state, syncedDay: '2000-1-1' }));
  await syncShopFavorites();
  assert.equal(requests.length, 3, 'cleared snapshots are not kept alive by daily empty visits');

  t.mock.timers.enable({ apis: ['setTimeout'] });
  let beginRequest!: () => void;
  const requestStarted = new Promise<void>(resolve => { beginRequest = resolve; });
  let finishRequest!: (value: { ok: boolean }) => void;
  const delayedResponse = new Promise<{ ok: boolean }>(resolve => { finishRequest = resolve; });
  let completeLatest!: () => void;
  const latestSent = new Promise<void>(resolve => { completeLatest = resolve; });
  let call = 0;
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async (_url: string, init: RequestInit) => {
    requests.push(JSON.parse(String(init.body)));
    if (++call === 1) { beginRequest(); return delayedResponse; }
    completeLatest();
    return { ok: true };
  } });
  await toggleShopFavorite('site', 'first-tab-site');
  const inFlight = syncShopFavorites();
  await requestStarted;
  await toggleShopFavorite('site', 'second-tab-site');
  await syncShopFavorites();
  assert.equal(call, 1, 'a second tab cannot send while another request owns the send lock');
  finishRequest({ ok: true });
  await inFlight;
  t.mock.timers.tick(600);
  await latestSent;
  assert.deepEqual(requests.at(-1)?.siteIds, ['first-tab-site', 'second-tab-site'], 'in-flight changes automatically send the latest full list');
  assert.ok(Number(requests.at(-1)?.revision) > Number(requests.at(-2)?.revision));
});
