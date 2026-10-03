import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

// The script runs unchanged; only browser event and navigation boundaries are replaced.
function browser() {
  const listeners = new Map<string, Function>();
  const activations: Array<Record<string, unknown>> = [];
  let selection = '';
  class Element {
    interactive = false;
    closest(selector: string): unknown { return selector.startsWith('a,') ? (this.interactive ? this : null) : row; }
  }
  class Anchor extends Element {
    constructor() { super(); this.interactive = true; }
    dispatchEvent(event: Record<string, unknown>) {
      activations.push(event);
      listeners.get('click')?.({ ...event, target: this });
      return true;
    }
  }
  class MouseEvent { constructor(type: string, options: Record<string, unknown>) { Object.assign(this, options, { type }); } }
  const anchor = new Anchor();
  const row = { querySelector: () => anchor };
  const target = new Element();
  const window = { getSelection: () => ({ toString: () => selection }) };
  vm.runInNewContext(fs.readFileSync('src/scripts/row-navigation.js', 'utf8'), {
    document: { addEventListener: (name: string, listener: Function) => listeners.set(name, listener) },
    Element, HTMLAnchorElement: Anchor, MouseEvent, window,
  });
  return {
    activations, target,
    select: (value: string) => { selection = value; },
    fire: (type: string, extra: Record<string, unknown> = {}) => listeners.get(type)?.({ type, target, button: 0, clientX: 20, clientY: 20, preventDefault() {}, ...extra }),
  };
}

test('row activation reaches its real link once and retains modified/new-tab intent', () => {
  const ui = browser();
  ui.fire('click', { metaKey: true, shiftKey: true });
  assert.equal(ui.activations.length, 1);
  assert.equal(ui.activations[0].metaKey, true);
  assert.equal(ui.activations[0].shiftKey, true);
  ui.fire('auxclick', { button: 1 });
  assert.equal(ui.activations.length, 2);
  assert.equal(ui.activations[1].ctrlKey, true);
});

test('nested controls, selected text, canceled events and drag gestures do not navigate', () => {
  const ui = browser();
  ui.target.interactive = true;
  ui.fire('click');
  ui.target.interactive = false;
  ui.select('copied model name');
  ui.fire('click');
  ui.select('');
  ui.fire('click', { defaultPrevented: true });
  ui.fire('pointerdown', { clientX: 0, clientY: 0 });
  ui.fire('click');
  assert.equal(ui.activations.length, 0);
});
