/** 文件说明: 验证中转站 API 地址的提交安全边界及正常 API 路径。 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { submitGatewaySite } from '../src/store.js';

const rejectedEndpoints = [
  'http://127.0.0.1:3100/api/status',
  'http://[::1]/v1',
  'http://169.254.169.254/latest/meta-data',
  'http://metadata.google.internal',
  'http://shop.localtest.me/api',
  'https://127.0.0.1.nip.io/v1',
  'https://scanner.oast.online/api/status',
  'https://cardnav.xyz/admin/api/action-status',
  'https://gateway.host/api?x=1%27%20OR%20%271%27=%271',
  'https://gateway.host/%00',
];

test('unsafe gateway API endpoints cannot reach the database', async (context) => {
  const query = context.mock.method(pg.Pool.prototype, 'query', () => {
    throw new Error('Rejected API endpoints must not reach the database');
  });
  for (const apiEndpoint of rejectedEndpoints) {
    const result = await submitGatewaySite({ url: 'https://gateway.host', apiEndpoint, name: 'Gateway', summary: '', paymentMethods: [] });
    assert.deepEqual(result, { ok: false, errorKey: 'gatewayInvalidApiEndpoint' }, apiEndpoint);
  }
  assert.equal(query.mock.callCount(), 0);
});

test('gateway submission preserves public API base paths and parameterized merchant text', async (context) => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgres://test:test@localhost/cardnav_test';
  context.after(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });
  const writes: unknown[][] = [];
  context.mock.method(pg.Pool.prototype, 'query', async (sql: string, values: unknown[]) => {
    if (sql.includes('INSERT INTO gateway_sites')) {
      writes.push(values);
      return { rows: [{ url: values[0] }] };
    }
    return { rows: [] };
  });
  const name = "O'Reilly API";
  const summary = 'Select your model and union of providers';
  for (const apiEndpoint of ['https://api.gateway.host/v1', 'https://api.gateway.host/api', 'https://api.gateway.host/prefix/api/status', 'https://api.gateway.host:8443/api/v1']) {
    const result = await submitGatewaySite({ url: 'https://gateway.host', apiEndpoint, name, summary, paymentMethods: [] });
    assert.equal(result.ok, true, apiEndpoint);
    const values = writes.at(-1)!;
    assert.equal(values[1], apiEndpoint);
    assert.equal(values[3], name);
    assert.equal(values[6], summary);
  }
});

class SubmitElementMock extends EventTarget {
  value = '';
  textContent = '';
  hidden = true;
  attributes = new Map<string, string>();
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  focus() {}
}

test('gateway API endpoint precheck rejects unsafe addresses before confirmation or requests', async (context) => {
  const fetch = context.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Rejected API endpoints must not send requests');
  });
  const fields = new Map(['url', 'apiEndpoint', 'name', 'summary'].map(name => [name, new SubmitElementMock()]));
  fields.get('url')!.value = 'https://gateway.host';
  fields.get('name')!.value = 'Gateway';
  const form = Object.assign(new SubmitElementMock(), { elements: { namedItem: (name: string) => fields.get(name) } });
  const error = new SubmitElementMock();
  const controls = new Map<string, unknown>([
    ['#gatewaySubmitForm', form],
    ['#gatewayPaymentSelect', { querySelectorAll: () => [] }],
    ['#gatewaySubmitError', error],
  ]);
  for (const selector of ['#gatewaySubmitSuccess', '[data-gateway-next]', '[data-gateway-back]', '[data-gateway-submit]', '[data-gateway-done]']) {
    controls.set(selector, new SubmitElementMock());
  }
  const dialog = Object.assign(new EventTarget(), {
    querySelector(selector: string) {
      assert.ok(controls.has(selector), `Rejected API endpoints must not reach confirmation: ${selector}`);
      return controls.get(selector);
    },
  });
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    getElementById: () => ({ textContent: JSON.stringify({ submit: { gatewayInvalidApiEndpoint: 'Invalid API address' } }) }),
    querySelector: (selector: string) => selector === '#gatewaySubmitDialog' ? dialog : null,
  } });
  try {
    await import(new URL('../src/scripts/submission-dialogs.js', import.meta.url).href);
    for (const endpoint of rejectedEndpoints) {
      fields.get('apiEndpoint')!.value = endpoint;
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      assert.equal(fields.get('apiEndpoint')!.attributes.get('aria-invalid'), 'true', endpoint);
      assert.equal(error.textContent, 'Invalid API address', endpoint);
      assert.equal(error.hidden, false, endpoint);
    }
    assert.equal(fetch.mock.callCount(), 0);
  } finally {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
