import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../src/scripts/dialog-navigation.js', import.meta.url), 'utf8');
const kinds = ['shop-submit', 'gateway-submit', 'support'] as const;

function browser(path = '/about?q=model#section') {
  const queued: (() => void)[] = [];
  class Element extends EventTarget {
    dataset: Record<string, string> = {};
    attributes: Record<string, string>;
    open = false;
    constructor(attributes: Record<string, string> = {}) { super(); this.attributes = attributes; }
    hasAttribute(name: string) { return name in this.attributes; }
    getAttribute(name: string) { return this.attributes[name] ?? null; }
    removeAttribute(name: string) { delete this.attributes[name]; }
    closest(selector: string) { return selector === 'details[open]' ? null : this; }
    showModal() { this.open = true; }
    close() { this.open = false; queued.push(() => this.dispatchEvent(new Event('close'))); }
  }
  const dialogs = new Map(kinds.map(kind => [kind, new Element()]));
  const document = new EventTarget() as EventTarget & { querySelector: (selector: string) => Element | null };
  document.querySelector = selector => dialogs.get(({
    '#shopSubmitDialog': 'shop-submit', '#gatewaySubmitDialog': 'gateway-submit', '#supportDialog': 'support',
  } as Record<string, typeof kinds[number]>)[selector]) ?? null;
  let url = new URL(path, 'https://cardnav.test');
  const window = Object.assign(new EventTarget(), {
    history: {
      pushState: (_state: unknown, _title: string, next: URL) => { url = new URL(next, url); },
      replaceState: (_state: unknown, _title: string, next: URL) => { url = new URL(next, url); },
    },
  });
  Object.defineProperty(window, 'location', { get: () => url });
  class CustomEvent extends Event { detail: unknown; constructor(type: string, options: { detail: unknown }) { super(type); this.detail = options.detail; } }
  runInNewContext(`${source.replace('export function', 'function')}\ninitDialogNavigation();`, { document, window, Element, CustomEvent, URL });
  return {
    dialogs,
    location: () => url,
    flush: () => { while (queued.length) queued.shift()!(); },
    pop: (next: string) => { url = new URL(next, url); window.dispatchEvent(new Event('popstate')); },
    click: (href: string, eventOptions: Record<string, unknown> = {}, attributes: Record<string, string> = {}) => {
      const target = new Element({ href, ...attributes });
      const event = new Event('click', { cancelable: true });
      Object.defineProperties(event, Object.fromEntries(Object.entries({ target, button: 0, ...eventOptions }).map(([key, value]) => [key, { value }])));
      document.dispatchEvent(event);
      return event.defaultPrevented;
    },
  };
}

for (const kind of kinds) {
  test(`${kind} opens from URL and closes while preserving the page query and fragment`, () => {
    const page = browser(`/en/about?q=model&dialog=${kind}${kind === 'support' ? '&support-kind=gateway' : ''}#section`);
    assert.equal(page.dialogs.get(kind)!.open, true);
    assert.equal([...page.dialogs.values()].filter(dialog => dialog.open).length, 1);
    page.dialogs.get(kind)!.close();
    page.flush();
    assert.equal(page.location().pathname + page.location().search + page.location().hash, '/en/about?q=model#section');
  });
}

test('clicks switch dialogs in place and queued close events cannot erase the new state', () => {
  const page = browser();
  for (const kind of [...kinds, 'shop-submit']) {
    assert.equal(page.click(`/shops?dialog=${kind}&support-kind=gateway`), true);
    page.flush();
    assert.equal(page.location().pathname, '/about');
    assert.equal(page.location().searchParams.get('q'), 'model');
    assert.equal(page.location().hash, '#section');
    assert.equal(page.location().searchParams.get('dialog'), kind);
    assert.equal([...page.dialogs.values()].filter(dialog => dialog.open).length, 1);
    assert.equal(page.dialogs.get(kind as typeof kinds[number])!.open, true);
    assert.equal(page.location().searchParams.get('support-kind'), kind === 'support' ? 'gateway' : null);
  }
});

test('back and forward synchronize the open dialog without stale close events clearing a reopened dialog', () => {
  const page = browser('/about?dialog=shop-submit');
  page.pop('/about?dialog=gateway-submit');
  page.pop('/about?dialog=shop-submit');
  page.flush();
  assert.equal(page.dialogs.get('shop-submit')!.open, true);
  assert.equal(page.dialogs.get('gateway-submit')!.open, false);
  assert.equal(page.location().searchParams.get('dialog'), 'shop-submit');
  page.pop('/about?q=model#section');
  page.flush();
  assert.equal([...page.dialogs.values()].some(dialog => dialog.open), false);
  assert.equal(page.location().search + page.location().hash, '?q=model#section');
});

test('modified clicks, external links and browser-owned link actions remain untouched', () => {
  const page = browser();
  for (const options of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
    assert.equal(page.click('?dialog=shop-submit', options), false);
  }
  assert.equal(page.click('https://external.test/?dialog=support'), false);
  assert.equal(page.click('?dialog=gateway-submit', {}, { target: '_blank' }), false);
  assert.equal(page.click('?dialog=gateway-submit', {}, { download: '' }), false);
  assert.equal(page.location().search + page.location().hash, '?q=model#section');
  assert.equal([...page.dialogs.values()].some(dialog => dialog.open), false);
});
