import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

for (const tableType of ['prices', 'modelSites']) {
  test(`${tableType} load-more preserves existing rows, sequences and quote identities`, () => {
    const source = ts.createSourceFile('gateway-detail-tables.js', fs.readFileSync('src/scripts/gateway-detail-tables.js', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    let declaration: ts.FunctionDeclaration | undefined;
    function visit(node: ts.Node) {
      if (ts.isFunctionDeclaration(node) && node.name?.text === 'renderEntries') declaration = node;
      ts.forEachChild(node, visit);
    }
    visit(source);
    assert.ok(declaration);
    type Row = { id: string; dataset: Record<string, string>; favorite?: boolean };
    let rows: Row[] = [];
    let hidden = false;
    const entries = ['a', 'b', 'c', 'd'].map(id => ({ site: { slug: id }, price: { id }, pinKind: id === 'a' ? 'partner' : '' }));
    const summary = { textContent: '' };
    const scope = {
      tableType, currentEntries: entries, visibleLimit: 2, renderedCount: 0, summary,
      config: { displaySummary: 'Showing {rendered} / {total}' },
      tbody: { append: (...next: Row[]) => { rows.push(...next); }, replaceChildren: (...next: Row[]) => { rows = next; } },
      button: { classList: { toggle: (_name: string, value: boolean) => { hidden = value; } } },
      priceRowElement: (price: { id: string }) => ({ id: price.id, dataset: {} }),
      modelSiteRowElement: (site: { pricesForModel: { id: string }[] }) => ({ id: site.pricesForModel[0].id, dataset: {} }),
      setTableRowSequence: (row: Row, sequence: number) => { row.dataset.sequence = String(sequence); },
      favorites: { sync: (row: Row) => { row.favorite = true; } },
    };
    const render = vm.runInNewContext(`(${declaration.getText(source)})`, scope);
    render();
    const firstRows = rows.slice();
    assert.equal(hidden, false);
    scope.visibleLimit = 4;
    render(true);
    assert.equal(rows[0], firstRows[0]);
    assert.equal(rows[1], firstRows[1]);
    assert.deepEqual(rows.map(row => row.id), ['a', 'b', 'c', 'd']);
    assert.deepEqual(rows.map(row => row.dataset.sequence), ['1', '2', '3', '4']);
    assert.ok(rows.every(row => row.favorite));
    assert.equal(summary.textContent, 'Showing 4 / 4');
    assert.equal(hidden, true);
    if (tableType === 'modelSites') assert.equal(rows[0].dataset.pinKind, 'partner');

    scope.currentEntries = entries.slice().reverse();
    scope.visibleLimit = 2;
    render();
    assert.deepEqual(rows.map(row => row.id), ['d', 'c']);
    assert.deepEqual(rows.map(row => row.dataset.sequence), ['1', '2']);
    assert.equal(summary.textContent, 'Showing 2 / 4');
    assert.equal(hidden, false);
  });
}
