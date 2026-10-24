/** 文件说明: 验证分类约束和商品搜索的商家补充规则。 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesShopCategory, searchShopProductRows } from '../src/shop-filter-state.js';
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

const searchOptions = { matchCategory: false, matchMerchant: false };
const merchantRows = [
  { productName: 'alpha subscription', siteText: 'other', autoCategory: 'gpt-plus' },
  { productName: 'monthly subscription', siteText: 'alpha shop', autoCategory: 'gpt-plus' },
  { productName: 'alpha subscription', siteText: 'alpha shop', autoCategory: 'gpt-plus' },
];
test('merchant products are opt-in when products match, and direct matches appear only once', () => {
  const query = buildShopSearchQuery('alpha');
  assert.deepEqual(searchShopProductRows(merchantRows, query, searchOptions), { products: [merchantRows[0], merchantRows[2]], merchantProducts: [] });
  assert.deepEqual(searchShopProductRows(merchantRows, query, { ...searchOptions, matchMerchant: true }), {
    products: [merchantRows[0], merchantRows[2]], merchantProducts: [merchantRows[1]],
  });
});
test('zero product matches automatically use merchant matches from the eligible product set', () => {
  const query = buildShopSearchQuery('shop');
  assert.deepEqual(searchShopProductRows(merchantRows.slice(0, 2), query, searchOptions), { products: [], merchantProducts: [merchantRows[1]] });
  assert.deepEqual(searchShopProductRows([merchantRows[0]], query, searchOptions), { products: [], merchantProducts: [] });
});
test('empty, invalid and explicit field searches retain their existing semantics', () => {
  assert.deepEqual(searchShopProductRows(merchantRows, buildShopSearchQuery(''), searchOptions), { products: merchantRows, merchantProducts: [] });
  assert.deepEqual(searchShopProductRows(merchantRows, { mode: 'invalid', raw: '(' }, searchOptions), { products: [], merchantProducts: [] });
  assert.deepEqual(searchShopProductRows(merchantRows, buildShopSearchQuery('site:alpha'), searchOptions), { products: merchantRows.slice(1), merchantProducts: [] });
});
