/**
 * 文件说明: 验证到账发布定向清理多语言缓存，并将失败保留给可靠重试。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { SupportPublication } from '../src/support/SupportPublication.js';

function configure() {
  process.env.CLOUDFLARE_ZONE_ID = 'a'.repeat(32);
  process.env.CLOUDFLARE_API_TOKEN = 'test-only-purge-token';
  process.env.PUBLIC_SITE_URL = 'https://cardnav.example.test';
}
test('shop publication purges affected pages and API including query variants', async () => {
  configure();
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(String(url), `https://api.cloudflare.com/client/v4/zones/${'a'.repeat(32)}/purge_cache`);
    const body = JSON.parse(String(options?.body));
    if (calls === 1) assert.deepEqual(body.prefixes, [
      'cardnav.example.test/supporters', 'cardnav.example.test/market',
      'cardnav.example.test/en/supporters', 'cardnav.example.test/en/market',
      'cardnav.example.test/ru/supporters', 'cardnav.example.test/ru/market',
      'cardnav.example.test/api/shop-products.json',
    ]);
    else assert.deepEqual(body.files, ['https://cardnav.example.test/', 'https://cardnav.example.test/en', 'https://cardnav.example.test/en/', 'https://cardnav.example.test/ru', 'https://cardnav.example.test/ru/']);
    assert.equal(body.purge_everything, undefined);
    assert.equal(options?.redirect, 'error');
    assert.ok(options?.signal);
    return Response.json({ success: true });
  };
  try {
    await new SupportPublication().publish({ kind: 'shop', siteId: 'shop1' });
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});

test('missing credentials and unsuccessful purge are not reported as published', async () => {
  configure();
  process.env.CLOUDFLARE_API_TOKEN = '';
  assert.throws(() => new SupportPublication(), /configuration/);
  configure();
  const original = globalThis.fetch;
  try {
    for (const response of [new Response('', { status: 403 }), Response.json({ success: false }), Response.json({})]) {
      globalThis.fetch = async () => response;
      await assert.rejects(new SupportPublication().publish({ kind: 'person', siteId: null }), /purge/);
    }
    globalThis.fetch = async () => { throw new DOMException('timeout', 'TimeoutError'); };
    await assert.rejects(new SupportPublication().publish({ kind: 'person', siteId: null }), /timeout/);
  } finally { globalThis.fetch = original; }
});
