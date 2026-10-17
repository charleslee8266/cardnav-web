/** 文件说明: 验证商家提交的浏览器预检在发起请求前拒绝探测网址。 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
const { initShopSubmitFlow } = await import(new URL('../src/scripts/shop-submit.js', import.meta.url).href);

class SubmitElementMock extends EventTarget {
  value = '';
  textContent = '';
  attributes = new Map<string, string>();
  classes = new Set(['hidden']);
  classList = {
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name),
  };
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  focus() {}
}

test('shop dialog blocks IP-mapping DNS and search homepages before confirmation or network requests', (context) => {
  const fetch = context.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Rejected submissions must not send requests');
  });
  const elements = new Map<string, SubmitElementMock>();
  for (const selector of ['#submitForm', '#urlInput', '#clientError', '#submitError', '#submitSuccess', '[data-shop-back]', '[data-shop-continue]', '[data-shop-submit]', '[data-shop-done]']) {
    elements.set(selector, new SubmitElementMock());
  }
  const dialog = Object.assign(new EventTarget(), {
    querySelector(selector: string) {
      assert.ok(elements.has(selector), `Rejected URLs must not reach the confirmation step: ${selector}`);
      return elements.get(selector);
    },
  });
  initShopSubmitFlow(dialog, { temporaryUrl: 'Temporary address rejected', platformHomeUrl: 'Homepage rejected' });
  const input = elements.get('#urlInput')!;
  const error = elements.get('#clientError')!;
  for (const [url, message] of [
    ['http://127.0.0.1.nip.io', 'Temporary address rejected'],
    ['http://foo.127.0.0.1.nip.io', 'Temporary address rejected'],
    ['https://8-8-8-8.sslip.io', 'Temporary address rejected'],
    ['https://shop.127.0.0.1.xip.io', 'Temporary address rejected'],
    ['https://google.com', 'Homepage rejected'],
    ['https://docs.qq.com', 'Homepage rejected'],
  ]) {
    input.value = url;
    elements.get('#submitForm')!.dispatchEvent(new Event('submit', { cancelable: true }));
    assert.equal(input.attributes.get('aria-invalid'), 'true', url);
    assert.equal(error.textContent, message, url);
    assert.equal(error.classes.has('hidden'), false, url);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test('gateway dialog rejects the Tencent Docs homepage before confirmation or network requests', async (context) => {
  const fetch = context.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Rejected submissions must not send requests');
  });
  const fields = new Map(['url', 'apiEndpoint', 'name', 'summary'].map(name => [name, new SubmitElementMock()]));
  fields.get('url')!.value = 'https://docs.qq.com';
  fields.get('name')!.value = 'Submitted site';
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
      assert.ok(controls.has(selector), `Rejected URLs must not reach confirmation: ${selector}`);
      return controls.get(selector);
    },
  });
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    getElementById: () => ({ textContent: JSON.stringify({ submit: { gatewayInvalidUrl: 'Invalid gateway address' } }) }),
    querySelector: (selector: string) => selector === '#gatewaySubmitDialog' ? dialog : null,
  } });
  try {
    await import(new URL('../src/scripts/submission-dialogs.js', import.meta.url).href);
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    assert.equal(fields.get('url')!.attributes.get('aria-invalid'), 'true');
    assert.equal(error.textContent, 'Invalid gateway address');
    assert.equal(fetch.mock.callCount(), 0);
  } finally {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
