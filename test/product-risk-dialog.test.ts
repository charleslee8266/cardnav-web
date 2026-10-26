/*
文件说明: 验证自建站商品与商家外链的风险确认、取消及免提醒偏好。
*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../src/scripts/ProductRiskDialog.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText.replace('export class', 'class');

function browser() {
  const preferences = new Map<string, string>();
  const documentEvents = new EventTarget();
  class Element extends EventTarget {}
  class Anchor extends Element {
    jumps = 0;
    shown: boolean[] = [];
    tracked: boolean[] = [];
    dataset: Record<string, string> = {};
    constructor(readonly risk: boolean) { super(); }
    closest(selector: string) { return selector.includes('data-product-risk') && !this.risk ? null : this; }
    click() { activate(this); }
  }
  const checkbox = { checked: false };
  const confirm = new Element();
  const dialog = Object.assign(new Element(), {
    open: false,
    querySelector: (selector: string) => selector === '[data-dismiss-product-risk]' ? checkbox : confirm,
    showModal() { this.open = true; },
    close() { this.open = false; dialog.dispatchEvent(new Event('close')); },
  });
  const trackingSource = readFileSync(new URL('../src/scripts/product-click-tracking.js', import.meta.url), 'utf8').replace('export function', 'function');
  runInNewContext(source + trackingSource + '\ntrackProductClicks({ click: link => link.tracked.push(link.dataset.productRiskShown === "1") });', {
    document: { addEventListener: documentEvents.addEventListener.bind(documentEvents), querySelector: () => dialog },
    Element, HTMLElement: Anchor, HTMLAnchorElement: Anchor,
    localStorage: { getItem: (key: string) => preferences.get(key), setItem: (key: string, value: string) => preferences.set(key, value) },
  });
  function activate(link: Anchor, type = 'click') {
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, { target: { value: link }, button: { value: type === 'auxclick' ? 1 : 0 } });
    documentEvents.dispatchEvent(event);
    if (!event.defaultPrevented) { link.jumps++; link.shown.push(link.dataset.productRiskShown === '1'); }
  }
  return { dialog, checkbox, confirm: () => confirm.dispatchEvent(new Event('click')), activate, link: (risk = true) => new Anchor(risk) };
}

test('merchant and product destinations only open after confirmation; cancellation does not navigate', () => {
  const b = browser();
  const merchant = b.link();
  b.activate(merchant);
  assert.equal(b.dialog.open, true);
  assert.equal(merchant.jumps, 0);
  b.dialog.close();
  assert.equal(merchant.jumps, 0);
  assert.deepEqual(merchant.tracked, []);
  const product = b.link();
  b.activate(product, 'auxclick');
  assert.equal(b.dialog.open, true);
  b.confirm();
  assert.equal(product.jumps, 1);
  assert.deepEqual(product.shown, [true]);
  assert.deepEqual(product.tracked, [true]);
  assert.equal(product.dataset.productRiskShown, undefined);
  assert.equal(b.dialog.open, false);
  assert.equal(merchant.jumps, 0);
});

test('do not remind preference applies to subsequent merchant and product links', () => {
  const b = browser();
  const first = b.link();
  b.activate(first);
  b.checkbox.checked = true;
  b.confirm();
  assert.equal(first.jumps, 1);
  for (const link of [b.link(), b.link()]) {
    b.activate(link);
    assert.equal(link.jumps, 1);
    assert.deepEqual(link.shown, [false]);
    assert.deepEqual(link.tracked, [false]);
    assert.equal(b.dialog.open, false);
  }
});

test('hosted platform links navigate directly without a risk dialog', () => {
  const b = browser();
  const hosted = b.link(false);
  b.activate(hosted);
  assert.equal(hosted.jumps, 1);
  assert.deepEqual(hosted.tracked, [false]);
  assert.equal(b.dialog.open, false);
});
