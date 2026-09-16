/**
 * 文件说明: 验证到账发布只刷新相关快照、定向清理多语言缓存，并将失败保留给可靠重试。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type pg from 'pg';
import { SupportPublication } from '../src/support/SupportPublication.js';

function configure() {
  process.env.CLOUDFLARE_ZONE_ID = 'a'.repeat(32);
  process.env.CLOUDFLARE_API_TOKEN = 'test-only-purge-token';
  process.env.PUBLIC_SITE_URL = 'https://cardnav.example.test';
}
function database(fail = false) {
  const snapshots: string[] = [];
  const statements: string[] = [];
  let released = false;
  const client = {
    async query(sql: string, values: unknown[] = []) {
      statements.push(sql.trim());
      if (sql.includes('INSERT INTO public_snapshot_entries')) {
        if (fail) throw new Error('snapshot write failed');
        snapshots.push(String(values[0]));
      }
      return { rows: [], rowCount: 0 };
    },
    release() { released = true; },
  };
  return { pool: { connect: async () => client } as unknown as pg.Pool,
    snapshots, statements, released: () => released };
}

test('shop publication rebuilds both snapshots before a bounded prefix purge including query variants', async () => {
  configure();
  const db = database();
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(db.statements.at(-1), 'COMMIT');
    assert.equal(db.released(), true);
    assert.equal(String(url), `https://api.cloudflare.com/client/v4/zones/${'a'.repeat(32)}/purge_cache`);
    const body = JSON.parse(String(options?.body));
    if (calls === 1) assert.deepEqual(body.prefixes, [
      'cardnav.example.test/supporters', 'cardnav.example.test/shops',
      'cardnav.example.test/en/supporters', 'cardnav.example.test/en/shops',
      'cardnav.example.test/ru/supporters', 'cardnav.example.test/ru/shops',
      'cardnav.example.test/api/shop-products.json',
    ]);
    else assert.deepEqual(body.files, ['https://cardnav.example.test/', 'https://cardnav.example.test/en', 'https://cardnav.example.test/en/', 'https://cardnav.example.test/ru', 'https://cardnav.example.test/ru/']);
    assert.equal(body.purge_everything, undefined);
    assert.equal(options?.redirect, 'error');
    assert.ok(options?.signal);
    return Response.json({ success: true });
  };
  try {
    await new SupportPublication(db.pool).publish({ kind: 'shop', siteId: 'shop1' });
    assert.deepEqual(db.snapshots, ['shop-products', 'shop-products-packed']);
    assert.ok(db.statements.includes('SELECT pg_advisory_xact_lock(73140, 1)'));
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});

test('snapshot failure rolls back before contacting Cloudflare', async () => {
  configure();
  const db = database(true);
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Cloudflare must not be called'); };
  try {
    await assert.rejects(new SupportPublication(db.pool).publish({ kind: 'gateway', siteId: 'gateway1' }), /snapshot write failed/);
    assert.equal(db.statements.at(-1), 'ROLLBACK');
    assert.equal(db.released(), true);
  } finally { globalThis.fetch = original; }
});

test('missing credentials and unsuccessful purge are not reported as published', async () => {
  configure();
  const db = database();
  process.env.CLOUDFLARE_API_TOKEN = '';
  assert.throws(() => new SupportPublication(db.pool), /configuration/);
  configure();
  const original = globalThis.fetch;
  try {
    for (const response of [new Response('', { status: 403 }), Response.json({ success: false }), Response.json({})]) {
      globalThis.fetch = async () => response;
      await assert.rejects(new SupportPublication(db.pool).publish({ kind: 'person', siteId: null }), /purge/);
    }
    globalThis.fetch = async () => { throw new DOMException('timeout', 'TimeoutError'); };
    await assert.rejects(new SupportPublication(db.pool).publish({ kind: 'person', siteId: null }), /timeout/);
    assert.deepEqual(db.statements, []);
  } finally { globalThis.fetch = original; }
});
