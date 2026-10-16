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
  let replacements = 0;
  let headerSort: unknown = null;
  const button = { setAttribute() { disabled = true; }, removeAttribute() { disabled = false; }, classList: { toggle() {} } };
  const scope = {
    nextTableSort, pinSiteRows,
    syncTableSortHeaders: (_table: unknown, sort: unknown) => { headerSort = sort; },
    createListLoading: () => ({ run: (task: () => Promise<unknown>) => task() }),
    setTableRowSequence: (element: ReturnType<typeof row>, index: number) => { element.dataset.sequence = String(index); },
    fetch: async () => ({ ok: false, status: 503, json: async () => ({ items: [{ score: 9 }, { score: 50 }, { score: 20 }, { score: 7 }], totalCount: 4 }) }),
    HTMLElement: class {}, window: {},
  };
  const create = vm.runInNewContext(
    fs.readFileSync('src/scripts/deferred-table-core.js', 'utf8').replace(/^import .*;$/gm, '').replace('export function', 'function') + '\ncreateDeferredTableController;', scope,
  );
  const controller = create({
    table: { closest: () => ({}) },
    tbody: { querySelectorAll: () => initialRows, append: (...rows: ReturnType<typeof row>[]) => { visibleRows.push(...rows); }, replaceChildren: (...rows: ReturnType<typeof row>[]) => { replacements++; visibleRows = rows; } },
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
  scope.fetch = async () => ({ ok: true, status: 200, json: async () => ({ items: [{ score: 9 }, { score: 50 }, { score: 20 }, { score: 7 }], totalCount: 4 }) });
  await controller.sortFromButton(control);
  assert.deepEqual(Array.from(controller.state.entries, (entry: any) => entry.row.score), [9, 50, 20, 7]);
  assert.deepEqual(visibleRows.map(item => item.score), [50, 20]);
  assert.equal(controller.state.sort.direction, 'desc');
  await controller.sortFromButton(control);
  assert.deepEqual(visibleRows.map(item => item.score), [7, 9]);
  assert.equal(controller.state.sort.direction, 'asc');
  await controller.sortFromButton(control);
  assert.equal(headerSort, null);
  assert.deepEqual(visibleRows.map(item => item.score), [9, 50]);
  const firstRows = visibleRows.slice();
  const replacementsBeforeMore = replacements;
  await controller.loadMore();
  assert.equal(replacements, replacementsBeforeMore);
  assert.equal(visibleRows[0], firstRows[0]);
  assert.equal(visibleRows[1], firstRows[1]);
  assert.deepEqual(visibleRows.map(item => item.score), [9, 50, 20, 7]);
  assert.deepEqual(visibleRows.map(item => item.dataset.sequence), ['1', '2', '3', '4']);
});
