/** 文件说明: 验证落库商品分类在公开搜索中的精确匹配。 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildShopSearchQuery, matchesShopSearchQuery } from '../src/shop-search-query.js';

const options = { matchCategory: false, matchMerchant: false };

test('plain search includes stored category without enabling the source-category toggle', () => {
  const row = { productName: '月卡', categoryName: 'GPT Pro 20X', autoCategory: 'gpt-pro-200' };
  assert.equal(matchesShopSearchQuery(row, buildShopSearchQuery('gpt pro 200'), options), true);
  assert.equal(matchesShopSearchQuery(row, buildShopSearchQuery('gpt pro 100'), options), false);
});

test('autocat is exact under whitespace, case, fuzzy mode, negation and grouped OR', () => {
  const row = { productName: '月卡', categoryName: 'GPT Pro 20X', autoCategory: 'gpt-pro-200' };
  for (const query of ['autocat: gpt-pro-200', 'AUTOCAT:GPT-PRO-200', '(autocat:gpt-pro-200|autocat:claude) 月卡']) {
    assert.equal(matchesShopSearchQuery(row, buildShopSearchQuery(query), { ...options, fuzzy: true }), true, query);
  }
  for (const query of ['autocat:gpt-pro', 'autocat:gpt-pro-20', '-autocat:gpt-pro-200', 'autocat:unknown', 'autocat:gpt*']) {
    assert.equal(matchesShopSearchQuery(row, buildShopSearchQuery(query), { ...options, fuzzy: true }), false, query);
  }
  assert.equal(matchesShopSearchQuery({ productName: 'autocat gpt-pro-200', autoCategory: 'other' }, buildShopSearchQuery('autocat:gpt-pro-200'), options), false);
});

test('stored classification controls exact and plain category search', () => {
  const row = { productName: 'GPT Plus', categoryName: 'GPT', autoCategory: 'api-gateway' };
  assert.equal(matchesShopSearchQuery(row, buildShopSearchQuery('autocat:api-gateway'), options), true);
  assert.equal(matchesShopSearchQuery(row, buildShopSearchQuery('中转站'), options), true);
  assert.equal(matchesShopSearchQuery(row, buildShopSearchQuery('autocat:gpt-plus'), options), false);
  assert.equal(matchesShopSearchQuery({ productName: 'GPT Plus' }, buildShopSearchQuery('autocat:other'), options), true);
});


test('current Grok Plus search stays separate from legacy SuperGrok Plus', () => {
  const current = { productName: 'Grok Plus 8美元', autoCategory: 'grok-plus' };
  const legacy = { productName: 'SuperGrok Plus 100美元', autoCategory: 'supergrok-plus' };
  assert.equal(matchesShopSearchQuery(current, buildShopSearchQuery('autocat:grok-plus'), options), true);
  assert.equal(matchesShopSearchQuery(legacy, buildShopSearchQuery('autocat:grok-plus'), options), false);
  assert.equal(matchesShopSearchQuery(current, buildShopSearchQuery('autocat:supergrok-plus'), options), false);
  assert.equal(matchesShopSearchQuery(legacy, buildShopSearchQuery('autocat:supergrok-plus'), options), true);
  assert.equal(matchesShopSearchQuery(current, buildShopSearchQuery('autocat:grok'), options), true);
  assert.equal(matchesShopSearchQuery(legacy, buildShopSearchQuery('autocat:grok'), options), true);
});
