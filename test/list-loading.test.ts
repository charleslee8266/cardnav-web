import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

class Element {
  children: Element[] = [];
  parent: Element | null = null;
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  hidden = false;
  textContent = '';
  hasRows = true;
  workspace: Element | null = null;
  closest() { return this.workspace; }
  setAttribute(key: string, value: string) { this.attributes[key] = value; }
  removeAttribute(key: string) { delete this.attributes[key]; }
  append(child: Element) { child.detach(); this.children.push(child); child.parent = this; }
  prepend(child: Element) { child.detach(); this.children.unshift(child); child.parent = this; }
  before(child: Element) {
    child.detach();
    this.parent!.children.splice(this.parent!.children.indexOf(this), 0, child);
    child.parent = this.parent;
  }
  after(child: Element) {
    child.detach();
    this.parent!.children.splice(this.parent!.children.indexOf(this) + 1, 0, child);
    child.parent = this.parent;
  }
  detach() {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
  }
  querySelector(selector: string) { return selector === 'table' ? null : (this.hasRows ? this.children.at(-1) : null); }
}
function setup(hasRows = true) {
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const create = vm.runInNewContext(
    fs.readFileSync('src/scripts/list-loading.js', 'utf8').replace('export function', 'function') + '\ncreateListLoading;',
    {
      document: { createElement: () => new Element(), body: { dataset: {} } },
      setTimeout(callback: () => void) { timers.set(++timerId, callback); return timerId; },
      clearTimeout(id: number) { timers.delete(id); },
    },
  );
  const root = new Element();
  root.hasRows = hasRows;
  const rows = new Element();
  root.append(rows);
  return { root, rows, create, loading: create(root), elapse: () => { for (const callback of timers.values()) callback(); timers.clear(); } };
}
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('floating loading is delayed while busy feedback is immediate; completion clears both', async () => {
  const { root, rows, loading, elapse } = setup();
  await loading.run(async () => {});
  const status = root.children[0];
  elapse();
  assert.equal(status.hidden, true);
  const request = deferred();
  const run = loading.run(() => request.promise);
  assert.equal(root.attributes['aria-busy'], 'true');
  assert.equal(root.dataset.listLoading, 'true');
  assert.equal(status.hidden, true);
  elapse();
  assert.equal(status.hidden, false);
  assert.ok(root.children.includes(rows));
  request.resolve();
  await run;
  assert.equal(root.attributes['aria-busy'], undefined);
  assert.equal(status.hidden, true);
});

test('load more and empty tables report loading immediately in their own regions', async () => {
  for (const hasRows of [true, false]) {
    const { root, rows, loading } = setup(hasRows);
    const footer = new Element();
    const button = new Element();
    root.append(footer);
    footer.append(button);
    const request = deferred();
    const run = loading.run(() => request.promise, { anchor: button });
    const status = hasRows ? footer.children[0] : root.children[0];
    assert.equal(status.hidden, false);
    assert.equal(status.dataset.placement, hasRows ? 'bottom' : 'list');
    assert.equal(status.parent, hasRows ? footer : root);
    assert.ok(root.children.includes(rows));
    request.resolve();
    await run;
  }
});

test('overlapping requests retain busy until all finish, report failure and allow retry', async () => {
  const { root, rows, loading } = setup();
  const first = deferred();
  const second = deferred();
  const a = loading.run(() => first.promise);
  const b = loading.run(() => second.promise);
  first.reject(new Error('offline'));
  await assert.rejects(a, /offline/);
  assert.equal(root.attributes['aria-busy'], 'true');
  second.resolve();
  await b;
  const status = root.children[0];
  assert.equal(root.attributes['aria-busy'], undefined);
  assert.equal(status.hidden, false);
  assert.equal(status.dataset.state, 'error');
  assert.ok(root.children.includes(rows));
  await loading.run(async () => {});
  assert.equal(status.hidden, true);
});


test('filters and category controls share the workspace cursor until every list request finishes', async () => {
  const { create } = setup();
  const workspace = new Element();
  const products = new Element();
  const merchants = new Element();
  products.workspace = workspace;
  merchants.workspace = workspace;
  workspace.append(products);
  workspace.append(merchants);
  const first = deferred();
  const second = deferred();
  const a = create(products).run(() => first.promise);
  const b = create(merchants).run(() => second.promise);
  assert.equal(workspace.dataset.listLoading, 'true');
  first.resolve();
  await a;
  assert.equal(workspace.dataset.listLoading, 'true');
  second.reject(new Error('offline'));
  await assert.rejects(b, /offline/);
  assert.equal(workspace.dataset.listLoading, undefined);
});
