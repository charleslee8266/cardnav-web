import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesShopCategory } from '../src/shop-filter-state.js';
import { buildShopSearchQuery, matchesShopSearchQuery } from '../src/shop-search-query.js';

const rows = [
  { productName: 'annual account', autoCategory: 'gpt-plus' },
  { productName: 'monthly account', autoCategory: 'gpt-plus' },
  { productName: 'annual account', autoCategory: 'claude-pro' },
  { productName: 'annual account', autoCategory: 'gpt-pro-100' },
];
const search = (category: string, keyword: string) => rows.filter(row =>
  matchesShopCategory(row.autoCategory, category)
  && matchesShopSearchQuery(row, buildShopSearchQuery(keyword), { matchCategory: false, matchMerchant: false }),
);
test('selected plan and keyword intersect; clearing either retains the other constraint', () => {
  assert.deepEqual(search('gpt-plus', 'annual'), [rows[0]]);
  assert.deepEqual(search('gpt-plus', ''), rows.slice(0, 2));
  assert.deepEqual(search('', 'annual'), [rows[0], rows[2], rows[3]]);
  assert.deepEqual(search('gpt-plus', 'unavailable'), []);
});
test('brand all-plans includes its plans without matching a different brand', () => {
  assert.deepEqual(search('gpt', 'annual'), [rows[0], rows[3]]);
});
