import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../src/scripts/announcement-init.js', import.meta.url), 'utf8');
const now = 1_000_000_000;
function init(records: Record<string, string>, blocked = false) {
  const styles = new Map<string, string>();
  let click: (event: unknown) => void;
  class Button {
    constructor(readonly id: string) {}
    closest(selector: string) { return selector === '[data-dismiss-announcement]' ? this : {dataset: {announcementId: this.id}}; }
  }
  vm.runInNewContext(source, {
    document: { currentScript: {dataset: {announcements: JSON.stringify([{id: 'new', repeatAfterHours: 24}, {id: 'second', repeatAfterHours: 0}])}}, documentElement: {style: {setProperty: (name: string, value: string) => styles.set(name, value)}}, addEventListener: (_: string, handler: typeof click) => {click = handler;} },
    Date: {now: () => now}, Element: Button, window: {},
    localStorage: {getItem: (key: string) => {if (blocked) throw Error('denied'); return records[key] ?? null;}, setItem: (key: string, value: string) => {if (blocked) throw Error('denied'); records[key] = value;}},
  });
  return { visible: () => [0,1].filter(i => styles.get(`--announcement-${i}-display`) === 'block'), close: (id: string) => click({target: new Button(id)}) };
}
test('pre-paint announcement selection respects dismissal, repeat interval and new identity', () => {
  assert.deepEqual(init({}).visible(), [0]);
  assert.deepEqual(init({'cardnav-announcement-new-dismissed-at': String(now)}).visible(), [1]);
  assert.deepEqual(init({'cardnav-announcement-new-dismissed-at': String(now), 'cardnav-announcement-second-dismissed-at': String(now)}).visible(), []);
  assert.deepEqual(init({'cardnav-announcement-new-dismissed-at': String(now - 24 * 3600000)}).visible(), [0]);
  assert.deepEqual(init({'cardnav-announcement-old-dismissed-at': String(now)}).visible(), [0]);
});
test('closing advances immediately and remains usable when storage is unavailable', () => {
  for (const blocked of [false,true]) {
    const records: Record<string,string> = {}; const state = init(records, blocked);
    state.close('new'); assert.deepEqual(state.visible(), [1]);
    state.close('second'); assert.deepEqual(state.visible(), []);
    if (!blocked) assert.deepEqual(init(records).visible(), []);
  }
});
