/**
 * 文件说明: 验证支付签名、金额与通知安全边界，防止跨站下单及参数污染。
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { getMessages } from '../src/i18n/messages.js';
import { EasyPay } from '../src/support/EasyPay.js';
import { orderParameters, parameters, OrderRateLimit } from '../src/support/http.js';

const key = 'test-only-merchant-key';
function configure() {
  process.env.EASYPAY_PID = '123';
  process.env.EASYPAY_PKEY = key;
  process.env.EASYPAY_API_URL = 'https://pay.example.test/epay/mapi.php';
  process.env.PUBLIC_SITE_URL = 'https://cardnav.example.test';
}
function notification(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = { pid: '123', out_trade_no: `cn_${'a'.repeat(32)}`, trade_no: 'trade_123',
    money: '20.00', trade_status: 'TRADE_SUCCESS', type: 'alipay', ...overrides };
  const serialized = Object.keys(values).filter(k => k !== 'sign' && k !== 'sign_type' && values[k])
    .sort().map(k => `${k}=${values[k]}`).join('&');
  return { ...values, sign: createHash('md5').update(serialized + key).digest('hex'), sign_type: 'MD5' };
}

test('hosted checkout signs trusted order and callbacks without exposing merchant secret', () => {
  configure();
  for (const locale of ['zh', 'en', 'ru'] as const) {
    const url = new URL(new EasyPay().checkout({ id: `cn_${'a'.repeat(32)}`, amountCents: 500000, returnPage: 'gateways', statusToken: 'b'.repeat(64), paymentType: 'wxpay' }, locale));
    assert.equal(url.searchParams.get('name'), getMessages(locale).support.title);
    assert.equal(url.origin, 'https://pay.example.test');
    assert.equal(url.pathname, '/epay/submit.php');
    assert.equal(url.searchParams.get('money'), '5000.00');
    assert.equal(url.searchParams.get('notify_url'), 'https://cardnav.example.test/api/support/notify');
    assert.equal(url.searchParams.get('return_url'), `https://cardnav.example.test${locale === 'zh' ? '' : `/${locale}`}/llm-gateway?support-dialog&support-order=${'b'.repeat(64)}`);
    assert.ok(!url.href.includes(key));
    const values = Object.fromEntries(url.searchParams);
    const canonical = Object.keys(values).filter(k => k !== 'sign' && k !== 'sign_type').sort().map(k => `${k}=${values[k]}`).join('&');
    assert.equal(values.sign, createHash('md5').update(canonical + key).digest('hex'));
  }
});

test('checkout accepts a safe string merchant ID and rejects signature delimiters', () => {
  configure();
  process.env.EASYPAY_PID = 'merchant_01-kyren.pay';
  const url = new URL(new EasyPay().checkout({ id: `cn_${'a'.repeat(32)}`, amountCents: 500, returnPage: 'shops', statusToken: 'b'.repeat(64), paymentType: 'alipay' }, 'zh'));
  assert.equal(url.searchParams.get('pid'), 'merchant_01-kyren.pay');
  process.env.EASYPAY_PID = 'merchant&injected=true';
  assert.throws(() => new EasyPay());
});

test('only correctly signed successful notifications with bounded whole-yuan amounts are accepted', () => {
  configure();
  const provider = new EasyPay();
  assert.equal(provider.verify(notification()).amountCents, 2000);
  for (const amount of ['5', '5.0', '5.00', '5000.00']) assert.equal(provider.verify(notification({ money: amount })).amountCents, Number(amount) * 100);
  const invalidNotifications: Record<string, string>[] = [{ pid: '456' }, { trade_status: 'WAIT_BUYER_PAY' }, { money: '0.00' }, { money: '1.00' }, { money: '4.00' }, { money: '20.01' },
    { money: '5001' }, { money: '2e1' }, { money: '-20' }, { out_trade_no: 'unknown' }, { trade_no: '' }, { type: 'qqpay' }];
  for (const overrides of invalidNotifications) {
    assert.throws(() => provider.verify(notification(overrides)));
  }
  assert.throws(() => provider.verify({ ...notification(), money: '30.00' }));
  assert.throws(() => provider.verify({ ...notification(), sign: '0'.repeat(32) }));
  assert.throws(() => provider.verify({ ...notification(), sign_type: 'RSA' }));
});

test('callback configuration rejects credentials, path prefixes and insecure endpoints', () => {
  for (const url of ['https://user:password@cardnav.example.test', 'https://cardnav.example.test/path', 'http://cardnav.example.test', 'https://cardnav.example.test/?x=1']) {
    configure(); process.env.PUBLIC_SITE_URL = url;
    assert.throws(() => new EasyPay());
  }
  configure(); process.env.EASYPAY_API_URL = 'http://pay.example.test';
  assert.throws(() => new EasyPay());
});

test('duplicate fields, oversized requests and cross-origin order creation are rejected', async () => {
  assert.throws(() => parameters('money=20&money=30'));
  assert.throws(() => parameters('sign=abc&%73ign=def'));
  assert.throws(() => parameters(`x=${'a'.repeat(9000)}`));
  const origin = 'https://cardnav.example.test';
  const request = (body: string, requestOrigin = origin) => new Request(`${origin}/api/support`, {
    method: 'POST', headers: { origin: requestOrigin, 'content-type': 'application/x-www-form-urlencoded' }, body,
  });
  assert.equal((await orderParameters(request('kind=shop&amount=5&email=a@example.com'), origin)).amount, '5');
  await assert.rejects(orderParameters(request('amount=5', 'https://evil.example'), origin));
  await assert.rejects(orderParameters(request('amount=5&amount=5000'), origin));
  await assert.rejects(orderParameters(request(`siteId=${'a'.repeat(5000)}`), origin));
  await assert.rejects(orderParameters(request('amount=5&notify_url=https://evil.example'), origin));
});

test('order creation rate limits a single client and total requests with bounded storage', () => {
  const limit = new OrderRateLimit();
  for (let i = 0; i < 20; i++) limit.take('client');
  assert.throws(() => limit.take('client'));
  for (let i = 0; i < 99; i++) limit.take(`client-${i}`);
  assert.throws(() => limit.take('new-client'));
});
