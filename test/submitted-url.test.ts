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
});

test('public submitted URL validation rejects product item URLs', () => {
  assert.deepEqual(validatePublicSubmittedUrl('https://pay.ldxp.cn/item/4zhbn2'), {
    ok: false,
    reason: 'productItemUrl',
    url: 'https://pay.ldxp.cn/item/4zhbn2',
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
    url: 'https://pay.ldxp.cn/shop/2VWX76A4',
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
