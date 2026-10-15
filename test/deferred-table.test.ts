import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { nextTableSort } from '../src/table-sort.js';
import { pinSiteRows } from '../src/site-list-pinning.js';

test('deferred sorting waits for complete data, preserves state on failure and resets to server order', async () => {
  const row = (score: number) => ({ score, dataset: {} as Record<string, string> });
  let visibleRows = [row(1), row(9)];
  const initialRows = visibleRows.slice();
  let disabled = false;
  let headerSort: unknown = null;
  const button = { setAttribute() { disabled = true; }, removeAttribute() { disabled = false; }, classList: { toggle() {} } };
  const scope = {
    nextTableSort, pinSiteRows,
    syncTableSortHeaders: (_table: unknown, sort: unknown) => { headerSort = sort; },
    createListLoading: () => ({ run: (task: () => Promise<unknown>) => task() }),
    setTableRowSequence: (element: ReturnType<typeof row>, index: number) => { element.dataset.sequence = String(index); },
    fetch: async () => ({ ok: false, status: 503, json: async () => ({ items: [{ score: 50 }, { score: 20 }], offset: 2, totalCount: 4 }) }),
    HTMLElement: class {}, window: {},
  };
  const create = vm.runInNewContext(
    fs.readFileSync('src/scripts/deferred-table-core.js', 'utf8').replace(/^import .*;$/gm, '').replace('export function', 'function') + '\ncreateDeferredTableController;', scope,
  );
  const controller = create({
    table: { closest: () => ({}) },
    tbody: { querySelectorAll: () => initialRows, replaceChildren: (...rows: ReturnType<typeof row>[]) => { visibleRows = rows; } },
    button, totalCount: 4, pageSize: 2, apiUrl: '/test',
    entryFromRow: (element: ReturnType<typeof row>, index: number) => ({ index, row: element, sort: { score: element.score } }),
    entryFromItem: (item: { score: number }, index: number) => ({ index, row: row(item.score), sort: { score: item.score } }),
    ensureRow: (entry: { row: ReturnType<typeof row> }) => entry.row,
  });
  controller.initialize();
  const control = { dataset: { sortKey: 'score', sortType: 'number' } };
  await assert.rejects(controller.sortFromButton(control), /503/);
  assert.equal(controller.state.sort, null);
  assert.equal(controller.state.visibleLimit, 2);
  assert.equal(controller.state.entries.length, 2);
  assert.equal(disabled, false);
  assert.deepEqual(visibleRows, initialRows);
  scope.fetch = async () => ({ ok: true, status: 200, json: async () => ({ items: [{ score: 50 }, { score: 20 }], offset: 2, totalCount: 4 }) });
  await controller.sortFromButton(control);
  assert.deepEqual(visibleRows.map(item => item.score), [50, 20]);
  assert.equal(controller.state.sort.direction, 'desc');
  await controller.sortFromButton(control);
  assert.deepEqual(visibleRows.map(item => item.score), [1, 9]);
  assert.equal(controller.state.sort.direction, 'asc');
  await controller.sortFromButton(control);
  assert.equal(headerSort, null);
  assert.deepEqual(visibleRows.map(item => item.score), [1, 9]);
  await controller.loadMore();
  assert.deepEqual(visibleRows.map(item => item.score), [1, 9, 50, 20]);
  assert.deepEqual(visibleRows.map(item => item.dataset.sequence), ['1', '2', '3', '4']);
});
