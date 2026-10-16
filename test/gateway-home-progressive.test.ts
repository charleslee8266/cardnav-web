import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

test('gateway load-more appends rows while a new complete snapshot replaces the old list', () => {
  const source = ts.createSourceFile('llm-gateway-home.js', fs.readFileSync('src/scripts/llm-gateway-home.js', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let declaration: ts.FunctionDeclaration | undefined;
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'renderGatewayList') declaration = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(declaration);
  type Row = { id: string; dataset: Record<string, string> };
  const entries = ['a', 'b', 'c', 'd'].map(id => ({ id, pinKind: id === 'a' ? 'partner' : '', row: null as Row | null }));
  let rows: Row[] = [];
  let replacements = 0;
  const list = {
    append: (...next: Row[]) => { rows.push(...next); },
    replaceChildren: (...next: Row[]) => { replacements++; rows = next; },
  };
  const state = { type: 'sites', listSelector: 'list', emptySelector: 'empty', visibleLimit: 2, filteredEntries: entries, renderedEntries: null, renderedCount: 0 };
  const render = vm.runInNewContext(`(${declaration.getText(source)})`, {
    gatewayHome: { querySelector: (selector: string) => selector === 'list' ? list : { classList: { toggle() {} } } },
    currentEntries: (value: typeof state) => value.filteredEntries,
    ensureEntryRow: (entry: typeof entries[number]) => entry.row ||= { id: entry.id, dataset: {} },
    setTableRowSequence: (row: Row, index: number) => { row.dataset.sequence = String(index); },
    updateLoadMoreButton() {}, updateSortButtons() {},
  });
  render(state);
  const firstRows = rows.slice();
  state.visibleLimit = 4;
  render(state, { reuseEntries: true });
  assert.equal(replacements, 1);
  assert.equal(rows[0], firstRows[0]);
  assert.equal(rows[1], firstRows[1]);
  assert.deepEqual(rows.map(row => row.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(rows.map(row => row.dataset.sequence), ['1', '2', '3', '4']);
  assert.equal(rows[0].dataset.pinKind, 'partner');

  state.filteredEntries = ['x', 'b', 'e'].map(id => ({ id, pinKind: '', row: null }));
  state.renderedEntries = null;
  render(state, { reuseEntries: true });
  assert.equal(replacements, 2);
  assert.deepEqual(rows.map(row => row.id), ['x', 'b', 'e']);
  assert.deepEqual(rows.map(row => row.dataset.sequence), ['1', '2', '3']);
});
