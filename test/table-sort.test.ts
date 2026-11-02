import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { nextSortDirection } from '../src/table-sort.js';

test('列排序依次降序、升序、恢复默认，并可再次开始', () => {
  let direction: 'asc' | 'desc' | null = null;
  const states = [];
  for (let click = 0; click < 4; click++) {
    direction = nextSortDirection(direction);
    states.push(direction);
  }
  assert.deepEqual(states, ['desc', 'asc', null, 'desc']);
});

test('切换列从降序开始，重复点击同列后恢复无排序状态', async () => {
  const { nextTableSort } = await import('../src/table-sort.js');
  const score = { dataset: { sortKey: 'score', sortType: 'number' } };
  const name = { dataset: { sortKey: 'name' } };
  let state = nextTableSort(null, score);
  assert.deepEqual(state, { key: 'score', type: 'number', direction: 'desc' });
  state = nextTableSort(state, score);
  assert.equal(state?.direction, 'asc');
  state = nextTableSort(state, name);
  assert.deepEqual(state, { key: 'name', type: 'text', direction: 'desc' });
  state = nextTableSort(state, name);
  assert.equal(state?.direction, 'asc');
  assert.equal(nextTableSort(state, name), null);
});

test('共用表头同步覆盖标准表格和分组列表，取消排序同时清除箭头和无障碍状态', async () => {
  const syncTableSortHeaders = vm.runInNewContext(fs.readFileSync('src/scripts/table-sort-headers.js', 'utf8').replace('export function', 'function') + '\nsyncTableSortHeaders;');
  const indicator = { dataset: { sortDirection: '' } };
  const status = { textContent: '' };
  const attributes: Record<string, string> = {};
  const header = { dataset: { sortDirection: '' }, setAttribute: (key: string, value: string) => { attributes[key] = value; }, querySelector: () => indicator };
  const button = {
    dataset: { sortKey: 'score', sortDirection: '' }, closest: () => header,
    querySelector: (selector: string) => selector === '.data-table-sort-status' ? status : indicator,
  };
  const root = { querySelectorAll: () => [button] };
  const labels = { clickSort: 'click', currentSort: 'current {direction}', ascending: 'asc', descending: 'desc' };
  syncTableSortHeaders(root, { key: 'score', direction: 'desc', type: 'number' }, labels);
  assert.equal(attributes['aria-sort'], 'descending');
  assert.equal(indicator.dataset.sortDirection, 'desc');
  assert.equal(status.textContent, 'current desc');
  syncTableSortHeaders(root, null, labels);
  assert.equal(attributes['aria-sort'], 'none');
  assert.equal(indicator.dataset.sortDirection, '');
  assert.equal(button.dataset.sortDirection, '');
  assert.equal(status.textContent, 'click');
});

test('rowValue correctly parses numeric and missing values and supports kebab-case keys', () => {
  const source = fs.readFileSync('src/scripts/data-table.js', 'utf8');
  const match = source.match(/function rowValue\([\s\S]*?\n\}/);
  assert.ok(match, 'rowValue function must exist in data-table.js');
  const rowValue = vm.runInNewContext(`${match[0]}; rowValue;`);

  const row = {
    dataset: {
      sortPrice: '19.9',
      sortZero: '0',
      sortEmpty: '',
      sortInvalid: 'NaN',
      sortEquivalentPrice: '142.5',
    },
  };

  assert.equal(rowValue(row, 'price', 'number'), 19.9);
  assert.equal(rowValue(row, 'zero', 'number'), 0);
  assert.equal(rowValue(row, 'empty', 'number'), null);
  assert.equal(rowValue(row, 'missing', 'number'), null);
  assert.equal(rowValue(row, 'invalid', 'number'), null);
  assert.equal(rowValue(row, 'equivalentPrice', 'number'), 142.5);
  assert.equal(rowValue(row, 'equivalent-price', 'number'), 142.5);
});
