/**
 * 文件说明: 验证公开商家提交 URL 的拒绝规则和规范化结果。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validatePublicSubmittedUrl } from '../src/submitted-url.js';

test('public submitted URL validation rejects temporary URLs', () => {
  assert.deepEqual(validatePublicSubmittedUrl('https://webhook.site/abc'), {
    ok: false,
    reason: 'temporaryUrl',
    url: 'https://webhook.site/abc',
  });
  assert.deepEqual(validatePublicSubmittedUrl('https://foo.serveousercontent.com/path'), {
    ok: false,
    reason: 'temporaryUrl',
    url: 'https://foo.serveousercontent.com/path',
  });
  assert.deepEqual(validatePublicSubmittedUrl('https://27668f68b80109.lhr.life/?v=cnvlt-1781977812726'), {
    ok: false,
    reason: 'temporaryUrl',
    url: 'https://27668f68b80109.lhr.life/?v=cnvlt-1781977812726',
  });
  assert.deepEqual(validatePublicSubmittedUrl('https://cnvlt1781973824978.loca.lt/user/api/index/commodity?limit=3&page=1'), {
    ok: false,
    reason: 'temporaryUrl',
    url: 'https://cnvlt1781973824978.loca.lt/user/api/index/commodity?limit=3&page=1',
  });
});

test('public submitted URL validation rejects product item URLs', () => {
  assert.deepEqual(validatePublicSubmittedUrl('https://pay.ldxp.cn/item/4zhbn2'), {
    ok: false,
    reason: 'productItemUrl',
    url: 'https://wzyp.cn/item/4zhbn2',
  });
  assert.deepEqual(validatePublicSubmittedUrl('https://catfk.com/shop/18Y8G3PT/pr84ki'), {
    ok: false,
    reason: 'productItemUrl',
    url: 'https://catfk.com/shop/18Y8G3PT/pr84ki',
  });
});

test('public submitted URL validation rejects IP address URLs', () => {
  assert.deepEqual(validatePublicSubmittedUrl('https://1.2.3.4/admin'), {
    ok: false,
    reason: 'ipAddressUrl',
    url: 'https://1.2.3.4/admin',
  });
  assert.deepEqual(validatePublicSubmittedUrl('http://[::1]/admin'), {
    ok: false,
    reason: 'ipAddressUrl',
    url: 'http://[::1]/admin',
  });
});

test('public submitted URL validation strips tracked storefront query parameters', () => {
  assert.deepEqual(validatePublicSubmittedUrl('https://pay.ldxp.cn/shop/2VWX76A4?u_atoken=x&u_asig=y'), {
    ok: true,
    url: 'https://wzyp.cn/shop/2VWX76A4',
  });
  assert.deepEqual(validatePublicSubmittedUrl('https://www.ldxp.cn/shop/2VWX76A4?u_atoken=x'), {
    ok: true,
    url: 'https://wzyp.cn/shop/2VWX76A4',
  });
  assert.deepEqual(validatePublicSubmittedUrl('https://ldxp.cn/shop/2VWX76A4?u_atoken=x'), {
    ok: true,
    url: 'https://wzyp.cn/shop/2VWX76A4',
  });
});

test('public submitted URL validation rejects platform homepages', () => {
  assert.deepEqual(validatePublicSubmittedUrl('https://pay.ldxp.cn'), {
    ok: false,
    reason: 'platformHomeUrl',
    url: 'https://wzyp.cn',
  });
  assert.deepEqual(validatePublicSubmittedUrl('https://www.ldxp.cn'), {
    ok: false,
    reason: 'platformHomeUrl',
    url: 'https://wzyp.cn',
  });
  assert.deepEqual(validatePublicSubmittedUrl('https://ldxp.cn'), {
    ok: false,
    reason: 'platformHomeUrl',
    url: 'https://wzyp.cn',
  });
  assert.deepEqual(validatePublicSubmittedUrl('https://catfk.com/'), {
    ok: false,
    reason: 'platformHomeUrl',
    url: 'https://catfk.com',
  });
});

test('public submitted URL validation rejects reserved hosts and probe URLs', () => {
  assert.deepEqual(validatePublicSubmittedUrl('http://metadata.google.internal/cardnav-audit'), {
    ok: false,
    reason: 'reservedHostUrl',
    url: 'http://metadata.google.internal/cardnav-audit',
  });
  assert.deepEqual(validatePublicSubmittedUrl('https://example.edu/ctf-cardnav-test'), {
    ok: false,
    reason: 'probeUrl',
    url: 'https://example.edu/ctf-cardnav-test',
  });
  assert.deepEqual(validatePublicSubmittedUrl('https://cardnav.xyz/admin/api/action-status?ctfssrf=1'), {
    ok: false,
    reason: 'probeUrl',
    url: 'https://cardnav.xyz/admin/api/action-status?ctfssrf=1',
  });
  assert.deepEqual(validatePublicSubmittedUrl('https://httpbin.org/base64/PCFkb2N0eXBlIGh0bWw+'), {
    ok: false,
    reason: 'probeUrl',
    url: 'https://httpbin.org/base64/PCFkb2N0eXBlIGh0bWw+',
  });
});

test('public submitted URL validation rejects non-http URLs', () => {
  assert.deepEqual(validatePublicSubmittedUrl('ftp://example.com/shop'), {
    ok: false,
    reason: 'invalidUrl',
  });
});

test('public submitted URL validation rejects incomplete domain URLs', () => {
  assert.deepEqual(validatePublicSubmittedUrl('http://localhost'), {
    ok: false,
    reason: 'invalidDomainUrl',
    url: 'http://localhost',
  });
  assert.deepEqual(validatePublicSubmittedUrl('https://example/path'), {
    ok: false,
    reason: 'invalidDomainUrl',
    url: 'https://example/path',
  });
});


test('all LDXP and WZYP aliases share one canonical storefront URL', () => {
  for (const host of ['ldxp.cn', 'pay.ldxp.cn', 'www.ldxp.cn', 'a.b.ldxp.cn', 'wzyp.cn', 'www.wzyp.cn', 'pay.wzyp.cn', 'WZYP.CN.']) {
    assert.deepEqual(validatePublicSubmittedUrl(`http://${host}:80/shop/ShopKey/?source=old#top`), { ok: true, url: 'https://wzyp.cn/shop/ShopKey' });
    assert.equal(validatePublicSubmittedUrl(`https://${host}/item/goods`).ok, false);
    assert.equal(validatePublicSubmittedUrl(`https://${host}/`).ok, false);
  }
  for (const host of ['evil-ldxp.cn', 'ldxp.cn.example', 'evil-wzyp.cn', 'wzyp.cn.example']) {
    assert.deepEqual(validatePublicSubmittedUrl(`https://${host}/shop/key`), { ok: true, url: `https://${host}/shop/key` });
  }
});

test('URL confirmation explains only transformations applied to the submitted address', () => {
  const changes: import('../src/submitted-url.js').PublicSubmittedUrlChange[] = [];
  assert.deepEqual(validatePublicSubmittedUrl('http://pay.ldxp.cn:8080/shop/store/?token=secret#products', changes), {
    ok: true, url: 'https://wzyp.cn/shop/store',
  });
  assert.deepEqual(changes, [
    { kind: 'fragment' },
    { kind: 'alias', from: 'pay.ldxp.cn', to: 'wzyp.cn' },
    { kind: 'protocol', from: 'http', to: 'https' },
    { kind: 'port', from: '8080' },
    { kind: 'query' },
    { kind: 'trailingSlash' },
  ]);
});

test('unchanged storefront addresses have no conversion notices and unrelated query parameters are preserved', () => {
  for (const input of ['https://wzyp.cn/shop/store', 'https://example.com', 'https://example.com/store?locale=en']) {
    const changes: import('../src/submitted-url.js').PublicSubmittedUrlChange[] = [];
    assert.deepEqual(validatePublicSubmittedUrl(input, changes), { ok: true, url: input });
    assert.deepEqual(changes, []);
  }
});

test('confirmation records URL parser normalization and a removed ending slash accurately', () => {
  const changes: import('../src/submitted-url.js').PublicSubmittedUrlChange[] = [];
  assert.deepEqual(validatePublicSubmittedUrl(' HTTPS://Example.COM:443/store/ ', changes), { ok: true, url: 'https://example.com/store' });
  assert.deepEqual(changes.map(change => change.kind), ['trim', 'format', 'trailingSlash']);
});
