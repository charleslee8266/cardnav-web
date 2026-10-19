/**
 * 文件说明: 验证公开商家提交 URL 的拒绝规则和规范化结果。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { submitSiteUrl, submitGatewaySite } from '../src/store.js';
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
  assert.deepEqual(validatePublicSubmittedUrl('https://example.com/ctf-cardnav-test'), {
    ok: false,
    reason: 'reservedHostUrl',
    url: 'https://example.com/ctf-cardnav-test',
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
  for (const host of ['evil-ldxp.cn', 'ldxp.cn.shop', 'evil-wzyp.cn', 'wzyp.cn.shop']) {
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
  for (const input of ['https://wzyp.cn/shop/store', 'https://merchant.shop', 'https://merchant.shop/store?locale=en']) {
    const changes: import('../src/submitted-url.js').PublicSubmittedUrlChange[] = [];
    assert.deepEqual(validatePublicSubmittedUrl(input, changes), { ok: true, url: input });
    assert.deepEqual(changes, []);
  }
});

test('confirmation records URL parser normalization and a removed ending slash accurately', () => {
  const changes: import('../src/submitted-url.js').PublicSubmittedUrlChange[] = [];
  assert.deepEqual(validatePublicSubmittedUrl(' HTTPS://Merchant.SHOP:443/store/ ', changes), { ok: true, url: 'https://merchant.shop/store' });
  assert.deepEqual(changes.map(change => change.kind), ['trim', 'format', 'trailingSlash']);
});


test('reserved example domains and their subdomains never enter the submission queue', () => {
  for (const host of ['example.com', 'www.example.com', 'a.b.example.net', 'EXAMPLE.ORG.', 'shop.example', 'shop.test', 'shop.localhost']) {
    for (const suffix of ['', '/store?locale=en']) {
      const result = validatePublicSubmittedUrl(`https://${host}:8443${suffix}`);
      assert.equal(result.ok, false, host + suffix);
      if (!result.ok) assert.equal(result.reason, 'reservedHostUrl');
    }
  }
});

test('invalid DNS hosts and credential-based URL bypasses are rejected before submission', () => {
  const inputs = [
    "http://www.example.com0'xor(if(now()=sysdate(),sleep(15),0))xor'z",
    'http://www.example.com0"xor(if(now()=sysdate(),sleep(15),0))xor"z',
    `http://www.example.com'"`,
    'https://store.shop%27',
    'https://store_shop.com',
    'https://-store.shop',
    'https://store-.shop',
    'https://store..shop',
    `https://${'a'.repeat(64)}.shop`,
    `https://${Array(4).fill('a'.repeat(63)).join('.')}`,
    'https://-bad.ldxp.cn/shop/store',
    'https://user:password@merchant.shop',
    'https://merchant.shop@example.com',
    'https://user@127.0.0.1',
    'https://user@webhook.site/path',
    'https://user@catfk.com',
  ];
  for (const input of inputs) assert.equal(validatePublicSubmittedUrl(input).ok, false, input);
});

test('clear injection probes in otherwise valid URLs are rejected, including encoded queries', () => {
  const inputs = [
    "https://merchant.shop/?id=0'xor(if(now()=sysdate(),sleep(15),0))xor'z",
    'https://merchant.shop/?id=1%27%20OR%201%3D1--',
    'https://merchant.shop/?id=1%2527%2520OR%25201%253D1--',
    'https://merchant.shop/?q=union+select+password+from+users',
    'https://merchant.shop/?q=%3Cscript%3Ealert(1)%3C/script%3E',
    'https://merchant.shop/?q=%3Csvg%20onload=alert(1)%3E',
    'https://merchant.shop/?bad=%zz&q=%27%20OR%201%3D1',
    'https://merchant.shop/path/pg_sleep(15)',
    'https://wzyp.cn/shop/store?q=sleep(15)',
  ];
  for (const input of inputs) {
    const result = validatePublicSubmittedUrl(input);
    assert.equal(result.ok, false, input);
    if (!result.ok) assert.equal(result.reason, 'probeUrl', input);
  }
});

test('normal international domains, ports, paths and query punctuation stay valid', () => {
  for (const input of [
    'https://商店.中国:8443/store?locale=zh',
    'https://xn--czrs0t.xn--fiqs8s/store',
    "https://merchant.shop/o'reilly?brand=O%27Reilly&sort=price&token=a+b%3D",
    'https://merchant.shop/sleep-products?query=select&category=benchmark',
    'https://merchant.shop/admin?test=1&probe=2',
    'https://example.shop/admin?test=1',
    'https://myexample.com/store',
    'https://example.com.merchant.shop/store',
    'https://merchant.shop:8443/store?redirect=https%3A%2F%2Fexample.com',
  ]) {
    const result = validatePublicSubmittedUrl(input);
    assert.deepEqual(result, { ok: true, url: new URL(input).toString().replace(/\/$/, '') }, input);
  }
});


test('public shop submission rejects example domains and injection probes without touching the database', async (context) => {
  const query = context.mock.method(pg.Pool.prototype, 'query', () => {
    throw new Error('Rejected submissions must not reach the database');
  });
  for (const input of [
    'http://www.example.com',
    "http://www.example.com0'xor(if(now()=sysdate(),sleep(15),0))xor'z",
    'http://www.example.com0"xor(if(now()=sysdate(),sleep(15),0))xor"z',
    `http://www.example.com'"`,
    'https://merchant.shop/?q=%3Cscript%3Ealert(1)%3C/script%3E',
    'https://user@merchant.shop',
    'http://127.0.0.1.nip.io',
    'http://foo.127.0.0.1.nip.io',
    'https://8-8-8-8.sslip.io',
    'https://google.com',
    'https://docs.qq.com',
  ]) {
    const validation = validatePublicSubmittedUrl(input);
    assert.equal(validation.ok, false, input);
    if (!validation.ok) assert.deepEqual(await submitSiteUrl(input), { ok: false, errorKey: validation.reason });
  }
  assert.equal(query.mock.callCount(), 0);
});


test('IP-mapping DNS services are rejected regardless of encoded target', () => {
  for (const host of [
    'nip.io', 'sslip.io', 'xip.io', '127.0.0.1.nip.io', 'foo.127.0.0.1.nip.io', 'store-127-0-0-1.sslip.io',
    'store.8.8.8.8.nip.io', '8-8-4-4.sslip.io', '7f000001.nip.io', 'test.0--1.sslip.io',
    '10.1.2.3.nip.io', '172-16-0-1.sslip.io', '192.168.1.1.xip.io',
    '169.254.169.254.nip.io', '100.64.0.1.nip.io', '0.0.0.0.nip.io',
    '224.0.0.1.nip.io', '255.255.255.255.nip.io', '127.0.0.1.NIP.IO.',
  ]) {
    const result = validatePublicSubmittedUrl(`http://${host}:8080/store`);
    assert.equal(result.ok, false, host);
    if (!result.ok) assert.equal(result.reason, 'temporaryUrl', host);
  }
  for (const host of ['127.0.0.1.nip.io.merchant.shop', 'my-nip.io', 'sslip.io.merchant.shop', 'myxip.io']) {
    const url = `https://${host}/store`;
    assert.deepEqual(validatePublicSubmittedUrl(url), { ok: true, url });
  }
});

test('Google search homepages are not storefront submissions', () => {
  for (const url of ['https://google.com', 'https://www.google.com/?hl=en', 'http://GOOGLE.COM.:8080/#top']) {
    const result = validatePublicSubmittedUrl(url);
    assert.equal(result.ok, false, url);
    if (!result.ok) assert.equal(result.reason, 'platformHomeUrl');
  }
  for (const url of ['https://google.com.merchant.shop', 'https://mygoogle.com', 'https://merchant.shop/?next=https://google.com']) {
    assert.deepEqual(validatePublicSubmittedUrl(url), { ok: true, url });
  }
});


test('Tencent Docs homepage is not a storefront, with exact host and path boundaries', () => {
  for (const url of ['https://docs.qq.com', 'https://docs.qq.com/?from=share', 'http://DOCS.QQ.COM.:8080/#top']) {
    const result = validatePublicSubmittedUrl(url);
    assert.equal(result.ok, false, url);
    if (!result.ok) assert.equal(result.reason, 'platformHomeUrl');
  }
  for (const url of ['https://docs.qq.com.merchant.shop', 'https://mydocs.qq.com', 'https://docs.qq.com/doc/merchant', 'https://merchant.shop/?next=https://docs.qq.com']) {
    assert.deepEqual(validatePublicSubmittedUrl(url), { ok: true, url });
  }
});


test('gateway submission rejects the Tencent Docs homepage without touching the database', async (context) => {
  const query = context.mock.method(pg.Pool.prototype, 'query', () => {
    throw new Error('Rejected submissions must not reach the database');
  });
  const result = await submitGatewaySite({ url: 'https://docs.qq.com', name: 'Submitted site', summary: '', paymentMethods: [] });
  assert.equal(result.ok, false);
  assert.equal(query.mock.callCount(), 0);
});

test('submission review rejects OAST, local DNS and obfuscated injection probes', () => {
  const inputs = [
    'https://merchant.shop/a%20union/**/select%201',
    'https://merchant.shop/?x=1%27%20OR%20%271%27=%271',
    "https://merchant.shop/a'NOR'1'='1",
    'https://merchant.shop/x%20or/**/1=1',
    'https://merchant.shop/?x=or1=1',
    'https://merchant.shop/%00',
    'https://merchant.shop/%2500',
    'https://merchant.shop/path\u0000',
    'https://merchant.shop/%3C$svg%20onload=alert(1)%3E',
    'https://scanner.oast.online/submission-check',
    'https://OAST.ONLINE.:8443/store',
    'http://localtest.me/store',
    'http://shop.lvh.me/store',
    'http://shop.vcap.me/store',
    'https://scanner.oast.live/store',
    'https://scanner.canarytokens.com/store',
    'http://127.0.0.1.traefik.me/store',
  ];
  for (const input of inputs) assert.equal(validatePublicSubmittedUrl(input).ok, false, input);
});

test('probe service boundaries and normal storefront expressions remain valid', () => {
  for (const input of [
    'https://oast.online.merchant.shop/store',
    'https://myoast.online/store',
    'https://lvh.me.merchant.shop/store',
    'https://mylocaltest.me/store',
    'https://merchant.shop/store?next=https://oast.online',
    'https://merchant.shop/orange?floor1=1&color=union&select=all',
    'https://merchant.shop/store?math=1=1&name=O%27Reilly',
  ]) assert.deepEqual(validatePublicSubmittedUrl(input), { ok: true, url: input }, input);
});


test('review probe submissions cannot write either shop or gateway queue', async (context) => {
  const query = context.mock.method(pg.Pool.prototype, 'query', () => {
    throw new Error('Rejected submissions must not reach the database');
  });
  for (const input of [
    'https://merchant.shop/a%20union/**/select%201',
    'https://merchant.shop/?x=1%27%20OR%20%271%27=%271',
    "https://merchant.shop/a'NOR'1'='1",
    'https://merchant.shop/x%20or/**/1=1',
    'https://merchant.shop/%00',
    'https://scanner.oast.online',
    'http://shop.localtest.me',
    'http://shop.lvh.me',
    'http://shop.vcap.me',
    'http://127.0.0.1.traefik.me',
    'https://httpbin.org/status/418',
    'https://www.google.com/url?q=http://169.254.169.254',
    'https://bit.ly',
  ]) {
    assert.equal((await submitSiteUrl(input)).ok, false, input);
    assert.equal((await submitGatewaySite({ url: input, name: 'Submitted site', summary: '', paymentMethods: [] })).ok, false, input);
  }
  assert.equal(query.mock.callCount(), 0);
});


test('diagnostic services, Google redirect URLs and shortener homepages are not merchant submissions', () => {
  for (const input of [
    'https://httpbin.org/delay/10',
    'https://httpbin.org/status/418',
    'https://httpbin.org/redirect-to?url=http://169.254.169.254',
    'https://sub.httpbin.org/store',
    'http://HTTPBIN.ORG.:8443/',
    'https://www.google.com/url?q=http://169.254.169.254',
    'https://google.com/url?url=https://merchant.shop',
    'https://t.co',
    'https://bit.ly/?source=home',
    'https://www.bit.ly',
  ]) assert.equal(validatePublicSubmittedUrl(input).ok, false, input);
  for (const input of [
    'https://httpbin.org.merchant.shop/store',
    'https://myhttpbin.org/store',
    'https://google.com.merchant.shop/url?q=products',
    'https://merchant.shop/url?q=https://merchant.shop',
    'https://merchant.shop/?redirect-to=https://merchant.shop',
    'https://bit.ly.merchant.shop',
    'https://mybit.ly',
  ]) assert.deepEqual(validatePublicSubmittedUrl(input), { ok: true, url: input }, input);
});
