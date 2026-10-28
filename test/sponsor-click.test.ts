/**
 * 文件说明: 验证合作点击的输入边界、真实链接校验及数据库幂等计数。
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { parseSponsorClick, type SponsorClickEvent } from '../src/sponsor-click.js';
import { SponsorClickStore } from '../src/SponsorClickStore.js';
import { getPool } from '../src/store.js';
import { POST } from '../src/pages/api/sponsor-clicks.js';

const sample = (): SponsorClickEvent => ({
  eventId: randomUUID(), visitorId: randomUUID(), occurredAt: new Date().toISOString(),
  sponsorId: 'test-card', placement: 'page-bottom', sourcePage: '/en/about', pageType: 'about',
  targetUrl: 'https://example.com/', linkKind: 'main',
});

test('sponsor clicks retain only valid page and target context, and reject credentials or stale timestamps', () => {
  const event = sample();
  assert.deepEqual(parseSponsorClick(event), event);
  for (const patch of [
    { eventId: 'bad' }, { visitorId: 'bad' }, { placement: 'other' }, { sourcePage: '/about?token=secret' },
    { sourcePage: '//evil.test/' }, { sourcePage: '/about#token' }, { pageType: 'invalid' },
    { targetUrl: 'javascript:alert(1)' }, { targetUrl: 'https://user:secret@example.com' },
    { occurredAt: new Date(Date.now() - 25 * 60 * 60_000).toISOString() },
  ]) assert.equal(parseSponsorClick({ ...event, ...patch }), null);
  const clean = parseSponsorClick({ ...event, sessionToken: 'private' });
  assert.ok(clean);
  assert.equal('sessionToken' in clean, false);
});

test('sponsor endpoint rejects cross-site and invalid batches before recording', async () => {
  const response = await POST({ request: new Request('https://cardnav.test/api/sponsor-clicks', {
    method: 'POST', headers: { origin: 'https://other.test' }, body: JSON.stringify(sample()),
  }) } as Parameters<typeof POST>[0]);
  assert.equal(response.status, 403);
  const invalid = await POST({ request: new Request('https://cardnav.test/api/sponsor-clicks', {
    method: 'POST', body: JSON.stringify({ events: [{ ...sample(), visitorId: 'bad' }] }),
  }) } as Parameters<typeof POST>[0]);
  assert.equal(invalid.status, 400);
});

test('valid placements count repeat clicks once per event and never accept unrelated targets', {
  skip: !process.env.SPONSOR_TEST_DATABASE_URL,
}, async () => {
  const original = process.env.DATABASE_URL;
  process.env.DATABASE_URL = process.env.SPONSOR_TEST_DATABASE_URL;
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const sponsorId = `sponsor_${randomUUID()}`;
  const visitorId = randomUUID();
  const store = new SponsorClickStore();
  try {
    await db.query(`INSERT INTO sponsors(id,title,url,links) VALUES ($1,'{"zh":"测试商家"}',
      '{"default":"https://example.com"}', '[{"url":{"default":"https://example.com/extra"},"text":{"default":"套餐"}}]')`, [sponsorId]);
    await db.query(`INSERT INTO sponsor_list_items(list_id,sponsor_id) VALUES ('full',$1),('shop',$1),('gateways',$1),('official-price',$1),('model-leaderboard',$1)`, [sponsorId]);
    const event = { ...sample(), sponsorId, visitorId };
    assert.equal((await store.record([event, event])).recorded, true);
    assert.equal((await store.record([event])).recorded, false);
    const top = { ...event, eventId: randomUUID(), placement: 'after-hero' as const, pageType: 'shops' as const, sourcePage: '/market' };
    const extra = { ...event, eventId: randomUUID(), targetUrl: 'https://example.com/extra', linkKind: 'extra' as const };
    const content = { ...event, eventId: randomUUID(), placement: 'content-bottom' as const, pageType: 'guide' as const, sourcePage: '/guide' };
    assert.equal((await store.record([top, extra, content])).recorded, true);
    const otherLists = [
      ['gateway', 'gateways'], ['official-price-detail', 'official-price'],
      ['model-leaderboard-detail', 'model-leaderboard'],
    ] as const;
    for (const [pageType] of otherLists) {
      assert.equal((await store.record([{ ...event, eventId: randomUUID(), placement: 'after-hero', pageType }])).recorded, true);
    }
    for (const patch of [
      { targetUrl: 'https://unrelated.test/' }, { sponsorId: 'missing' },
      { linkKind: 'extra' as const }, { placement: 'after-hero' as const, pageType: 'about' as const },
    ]) assert.equal((await store.record([{ ...event, ...patch, eventId: randomUUID() }])).recorded, false);
    const rows = await db.query('SELECT * FROM sponsor_click_events WHERE visitor_id=$1', [visitorId]);
    assert.equal(rows.rowCount, 7);
    assert.deepEqual(new Set(rows.rows.map(row => row.list_id)), new Set(['full', 'shop', 'gateways', 'official-price', 'model-leaderboard']));
    assert.ok(rows.rows.filter(row => row.placement !== 'after-hero').every(row => row.list_id === 'full'));
    assert.deepEqual(new Set(rows.rows.map(row => row.placement)), new Set(['page-bottom', 'after-hero', 'content-bottom']));
    await db.query('DELETE FROM sponsors WHERE id=$1', [sponsorId]);
    assert.equal((await db.query('SELECT COUNT(*) FROM sponsor_click_events WHERE visitor_id=$1', [visitorId])).rows[0].count, '7');
  } finally {
    await db.query('DELETE FROM sponsor_click_events WHERE visitor_id=$1', [visitorId]);
    await db.query('DELETE FROM sponsors WHERE id=$1', [sponsorId]);
    await db.end();
    await getPool().end();
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  }
});

test('deferred sponsor links report one event per activation, including middle click with disabled storage', async context => {
  const saved = new Map<string, PropertyDescriptor | undefined>();
  const listeners = new Map<string, (event: MouseEvent) => void>();
  const document = new EventTarget();
  const add = document.addEventListener.bind(document);
  document.addEventListener = ((name: string, fn: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean) => {
    if (name === 'click' || name === 'auxclick') listeners.set(name, fn as (event: MouseEvent) => void);
    return add(name, fn, options);
  }) as typeof document.addEventListener;
  const globals = {
    document, window: new EventTarget(), location: { pathname: '/en/about' },
    localStorage: { getItem() { throw new Error('disabled'); }, setItem() { throw new Error('disabled'); } },
  };
  for (const [key, value] of Object.entries(globals)) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  class DeferredLink {
    href = 'https://example.com/';
    dataset = { sponsorClickId: 'test-card', sponsorLinkKind: 'main' };
    closest(selector: string) {
      return selector.startsWith('a[') ? this : { dataset: { placement: 'page-bottom', sponsorPageType: 'about' } };
    }
  }
  saved.set('Element', Object.getOwnPropertyDescriptor(globalThis, 'Element'));
  Object.defineProperty(globalThis, 'Element', { configurable: true, value: DeferredLink });
  const reports: SponsorClickEvent[] = [];
  context.mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit) => {
    assert.equal(url, '/api/sponsor-clicks');
    const body = JSON.parse(String(init.body));
    reports.push(...body.events.map((event: object) => ({ ...event, visitorId: body.visitorId })));
    return new Response(null, { status: 202 });
  });
  try {
    await import('../src/scripts/sponsor-click-tracking.js');
    // Link appears after the listener was attached, as with deferred sponsor fragments.
    const link = new DeferredLink();
    const event = { type: 'click', button: 0, defaultPrevented: false, target: link } as unknown as MouseEvent;
    listeners.get('click')!(event);
    link.dataset.sponsorLinkKind = 'extra';
    link.href = 'https://example.com/extra';
    listeners.get('auxclick')!({ ...event, type: 'auxclick', button: 1 } as MouseEvent);
    listeners.get('click')!({ ...event, defaultPrevented: true } as MouseEvent);
    listeners.get('auxclick')!({ ...event, type: 'auxclick', button: 2 } as MouseEvent);
    assert.equal(reports.length, 2);
    assert.notEqual(reports[0].eventId, reports[1].eventId);
    assert.equal(reports[0].visitorId, reports[1].visitorId);
    assert.equal(reports[0].sourcePage, '/en/about');
    assert.equal(reports[1].placement, 'page-bottom');
    assert.equal(reports[0].linkKind, 'main');
    assert.equal(reports[1].linkKind, 'extra');
    assert.equal(reports[1].targetUrl, link.href);
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
