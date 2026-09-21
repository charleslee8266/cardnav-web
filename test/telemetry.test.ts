/**
 * 文件说明: 验证公开站 telemetry 的外链归一化、来源上下文和 sponsor badge 事件契约。
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { telemetryBlocks } from '../src/telemetry-blocks.js';

type FakeAnchor = {
  classList: { contains: (name: string) => boolean };
  dataset: Record<string, string>;
  href: string;
  textContent: string;
  closest: (selector: string) => FakeAnchor | null;
};

async function loadTelemetry() {
  class FakeElement {}
  class FakeAnchorElement extends FakeElement {}
  const listeners: Array<{ handler: (event: { target: FakeAnchor }) => void; capture: boolean }> = [];
  const context = {
    document: {
      body: { dataset: { sourcePage: '/llm-gateway/demo', sourcePageType: 'gateway-detail', telemetryBlock: telemetryBlocks.shared.page } },
      addEventListener(type: string, handler: (event: { target: FakeAnchor }) => void, capture = false) {
        if (type === 'click') listeners.push({ handler, capture });
      },
      querySelectorAll: () => [],
      querySelector: () => null,
      getElementById: () => null,
      documentElement: { getAttribute: () => 'light' },
    },
    window: {
      location: { href: 'https://cardnav.xyz/llm-gateway/demo', origin: 'https://cardnav.xyz', pathname: '/llm-gateway/demo' },
      umami: { track: () => undefined },
      clearTimeout: () => undefined,
      setTimeout: () => 0,
    },
    Element: FakeElement,
    HTMLAnchorElement: FakeAnchorElement,
    HTMLDetailsElement: class {},
    URL,
    console,
  } as Record<string, unknown> & { window: Record<string, unknown> };
  (context.window as Record<string, unknown>).window = context.window;
  const sandbox = vm.createContext(context);
  vm.runInContext(await readFile(new URL('../src/scripts/public-telemetry.js', import.meta.url), 'utf8'), sandbox);

  const telemetryClick = listeners.find(listener => listener.capture)?.handler;
  assert.ok(telemetryClick);
  return { context: sandbox, telemetryClick };
}

function createAnchor(context: Record<string, unknown>, values: Partial<FakeAnchor> = {}): FakeAnchor {
  const anchor = Object.assign(vm.runInContext('new HTMLAnchorElement()', context as vm.Context), {
    classList: { contains: () => false },
    dataset: {},
    href: 'https://example.com/target',
    textContent: 'External link',
    closest: () => null,
    ...values,
  });
  if (!values.closest) anchor.closest = (selector: string) => selector.includes('a[href]') || selector.includes('[data-umami-event]') ? anchor : null;
  return anchor as unknown as FakeAnchor;
}

test('external links are normalized with target and source dimensions', async () => {
  const { context, telemetryClick } = await loadTelemetry();
  const calls: Array<{ name: string; data: Record<string, string> }> = [];
  (context.window as { umami: { track: (name: string, data: Record<string, string>) => void } }).umami.track = (name, data) => calls.push({ name, data });
  const anchor = createAnchor(context, {
    href: 'https://down.dginv.click/#/register?code=O1LnSIXG',
    dataset: {
      umamiEvent: 'external-link-click',
      umamiEventLinkType: 'sponsor',
      umamiEventName: 'gougou',
      umamiEventLinkId: 'gougou',
      umamiEventUrl: 'https://down.dginv.click/#/register?code=O1LnSIXG',
    },
  });

  const nearest = anchor.closest;
  anchor.closest = selector => selector === '[data-telemetry-block]'
    ? { getAttribute: () => telemetryBlocks.sponsors['after-hero'] } as unknown as FakeAnchor
    : nearest(selector);

  telemetryClick({ target: anchor });

  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{
    name: 'external-link-click',
    data: {
      'source-page': '/llm-gateway/demo',
      'source-page-type': 'gateway-detail',
      'source-block': telemetryBlocks.sponsors['after-hero'],
      'link-type': 'sponsor',
      name: 'gougou',
      'link-id': 'gougou',
      url: 'https://down.dginv.click/#/register?code=O1LnSIXG',
    },
  }]);
});

test('sponsor badge links get a single internal event with partnership context', async () => {
  const { context, telemetryClick } = await loadTelemetry();
  const calls: Array<{ name: string; data: Record<string, string> }> = [];
  (context.window as { umami: { track: (name: string, data: Record<string, string>) => void } }).umami.track = (name, data) => calls.push({ name, data });
  const anchor = createAnchor(context, {
    classList: { contains: name => name === 'merchant-badge-link' },
    href: 'https://cardnav.xyz/partnership',
    textContent: 'How to partner',
    dataset: {
      umamiEvent: 'internal-link-click',
      umamiEventLinkType: 'sponsor-lead',
      umamiEventUrl: 'https://cardnav.xyz/partnership',
    },
  });

  telemetryClick({ target: anchor });

  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{
    name: 'internal-link-click',
    data: {
      'source-page': '/llm-gateway/demo',
      'source-page-type': 'gateway-detail',
      'source-block': telemetryBlocks.shared.page,
      url: '/partnership',
      'target-page': '/partnership',
      'link-type': 'sponsor-lead',
      name: 'How to partner',
    },
  }]);
});

test('internal navigation reports destination and category exactly once', async () => {
  const { context, telemetryClick } = await loadTelemetry();
  const calls: Array<{ name: string; data: Record<string, string> }> = [];
  (context.window as { umami: { track: (name: string, data: Record<string, string>) => void } }).umami.track = (name, data) => calls.push({ name, data });
  const anchor = createAnchor(context, {
    href: 'https://cardnav.xyz/shops',
    dataset: { umamiEvent: 'internal-link-click', umamiEventLinkType: 'nav', umamiEventName: 'Shops' },
  });

  telemetryClick({ target: anchor });

  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{
    name: 'internal-link-click',
    data: {
      'source-page': '/llm-gateway/demo',
      'source-page-type': 'gateway-detail',
      'source-block': telemetryBlocks.shared.page,
      'link-type': 'nav',
      name: 'Shops',
      url: '/shops',
      'target-page': '/shops',
    },
  }]);
});

test('manual events inherit the same source dimensions', async () => {
  const { context } = await loadTelemetry();
  const calls: Array<{ name: string; data: Record<string, string> }> = [];
  const windowObject = context.window as { CardNavTelemetry: { track: (name: string, data?: Record<string, string>, sourceElement?: FakeAnchor) => void }; umami: { track: (name: string, data: Record<string, string>) => void } };
  windowObject.umami.track = (name, data) => calls.push({ name, data });

  const sourceElement = createAnchor(context);
  sourceElement.closest = () => ({ getAttribute: () => telemetryBlocks.shops.products }) as unknown as FakeAnchor;
  windowObject.CardNavTelemetry.track('filter-change', { name: 'fuzzy' }, sourceElement);

  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{
    name: 'filter-change',
    data: {
      'source-page': '/llm-gateway/demo',
      'source-page-type': 'gateway-detail',
      'source-block': telemetryBlocks.shops.products,
      name: 'fuzzy',
    },
  }]);
});

test('external clicks use the actual destination even with stale event metadata', async () => {
  const { context, telemetryClick } = await loadTelemetry();
  const calls: Array<{ name: string; data: Record<string, string> }> = [];
  context.window.umami = { track: (name: string, data: Record<string, string>) => calls.push({ name, data }) };
  telemetryClick({ target: createAnchor(context, {
    href: 'https://example.com/register?a=1&b=2',
    dataset: { umamiEvent: 'custom-link-click', umamiEventUrl: 'https://example.com/old' },
  }) });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'external-link-click');
  assert.equal(calls[0].data.url, 'https://example.com/register?a=1&b=2');
});

test('localized source context comes from the page rather than article metadata', async () => {
  const { context, telemetryClick } = await loadTelemetry();
  vm.runInContext("window.location.pathname = '/en/guide/start'; document.body.dataset.sourcePageType = 'guide'", context);
  const calls: Array<{ name: string; data: Record<string, string> }> = [];
  context.window.umami = { track: (name: string, data: Record<string, string>) => calls.push({ name, data }) };
  telemetryClick({ target: createAnchor(context, {
    dataset: { umamiEventSourcePage: '/guide/start' },
  }) });
  assert.equal(calls[0].data['source-page'], '/en/guide/start');
});

test('source follows the current pathname after in-page navigation without query or hash', async () => {
  const { context, telemetryClick } = await loadTelemetry();
  const calls: Array<{ name: string; data: Record<string, string> }> = [];
  context.window.umami = { track: (name: string, data: Record<string, string>) => calls.push({ name, data }) };
  vm.runInContext("window.location = new URL('https://cardnav.xyz/en/shops?q=private-input#list')", context);
  telemetryClick({ target: createAnchor(context) });
  vm.runInContext("window.location = new URL('https://cardnav.xyz/en/shops/claude'); window.CardNavTelemetry.track('filter-change')", context);
  assert.deepEqual(calls.map(call => call.data['source-page']), ['/en/shops', '/en/shops/claude']);
});

test('missing, throwing and rejecting trackers do not interrupt clicks or manual actions', async () => {
  const { context, telemetryClick } = await loadTelemetry();
  for (const tracker of [undefined, { track: () => { throw new Error('blocked'); } }, { track: () => Promise.reject(new Error('offline')) }]) {
    context.window.umami = tracker;
    assert.doesNotThrow(() => telemetryClick({ target: createAnchor(context) }));
    assert.doesNotThrow(() => vm.runInContext("window.CardNavTelemetry.track('tool-action')", context));
    await new Promise(resolve => setImmediate(resolve));
  }
});

test('unannotated internal links and explicit buttons each emit only their own event', async () => {
  const { context, telemetryClick } = await loadTelemetry();
  const calls: Array<{ name: string; data: Record<string, string> }> = [];
  context.window.umami = { track: (name: string, data: Record<string, string>) => calls.push({ name, data }) };
  telemetryClick({ target: createAnchor(context, { href: 'https://cardnav.xyz/en/guide/start#risk' }) });
  const button = createAnchor(context, { dataset: { umamiEvent: 'button-click', umamiEventAction: 'open-submit' } });
  Object.setPrototypeOf(button, vm.runInContext('Element.prototype', context));
  telemetryClick({ target: button });
  telemetryClick({ target: createAnchor(context, { href: 'mailto:contact@example.com' }) });
  assert.deepEqual(calls.map(call => call.name), ['internal-link-click', 'button-click']);
  assert.equal(calls[0].data.url, '/en/guide/start#risk');
  assert.equal(calls[1].data.action, 'open-submit');
});

test('support entry links defer to the support-open event instead of emitting navigation telemetry', async () => {
  const { context, telemetryClick } = await loadTelemetry();
  const calls: Array<{ name: string; data: Record<string, string> }> = [];
  context.window.umami = { track: (name: string, data: Record<string, string>) => calls.push({ name, data }) };
  const anchor = createAnchor(context, {
    href: 'https://cardnav.xyz/shops?support-dialog',
    dataset: { openSupport: '' },
  });
  const fallbackClosest = anchor.closest;
  anchor.closest = selector => selector === '[data-open-support]' ? anchor : fallbackClosest(selector);

  telemetryClick({ target: anchor });

  assert.deepEqual(calls, []);
});
