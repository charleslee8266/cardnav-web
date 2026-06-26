/**
 * 文件说明: 验证卡网商品页高级搜索解析与字段匹配行为。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildShopSearchQuery, matchesShopSearchQuery } from '../src/shop-search-query.js';

const baseOptions = { matchCategory: false, matchMerchant: false };

test('shop search query treats implicit AND as required terms without plus prefix', () => {
  const query = buildShopSearchQuery('gpt plus');
  assert.equal(query.mode, 'advanced');
  assert.equal(
    matchesShopSearchQuery({ productName: 'plus chatgpt account' }, query, baseOptions),
    true,
  );
  assert.equal(
    matchesShopSearchQuery({ productName: 'gpt account only' }, query, baseOptions),
    false,
  );
});

test('shop search query supports grouped OR terms with shared required terms', () => {
  const query = buildShopSearchQuery('x (premium plus|premium+)');
  assert.equal(matchesShopSearchQuery({ productName: 'x premium+' }, query, baseOptions), true);
  assert.equal(matchesShopSearchQuery({ productName: 'x premium plus' }, query, baseOptions), true);
  assert.equal(matchesShopSearchQuery({ productName: 'x premium' }, query, baseOptions), false);
  assert.equal(matchesShopSearchQuery({ productName: 'premium plus' }, query, baseOptions), false);
});

test('shop search query supports NOT exclusions', () => {
  const query = buildShopSearchQuery('gpt plus -(free|普号)');
  assert.equal(matchesShopSearchQuery({ productName: 'gpt plus account' }, query, baseOptions), true);
  assert.equal(matchesShopSearchQuery({ productName: 'gpt plus free' }, query, baseOptions), false);
});

test('shop search query supports shorthand OR groups and prefixed exclusions', () => {
  const query = buildShopSearchQuery('gpt plus -(free|普号)');
  assert.equal(matchesShopSearchQuery({ productName: 'gpt plus account' }, query, baseOptions), true);
  assert.equal(matchesShopSearchQuery({ productName: 'gpt plus free' }, query, baseOptions), false);
  assert.equal(matchesShopSearchQuery({ productName: 'gpt plus 普号' }, query, baseOptions), false);
});

test('shop search query supports shorthand grouped expression format', () => {
  const query = buildShopSearchQuery('A (B|C) -(D|E)');
  assert.equal(matchesShopSearchQuery({ productName: 'a b' }, query, baseOptions), true);
  assert.equal(matchesShopSearchQuery({ productName: 'a c' }, query, baseOptions), true);
  assert.equal(matchesShopSearchQuery({ productName: 'a b d' }, query, baseOptions), false);
  assert.equal(matchesShopSearchQuery({ productName: 'a f' }, query, baseOptions), false);
});

test('shop search query tolerates extra parentheses around complete groups', () => {
  const query = buildShopSearchQuery('((A (B|C))) -((D|E))');
  assert.equal(matchesShopSearchQuery({ productName: 'a b' }, query, baseOptions), true);
  assert.equal(matchesShopSearchQuery({ productName: 'a c' }, query, baseOptions), true);
  assert.equal(matchesShopSearchQuery({ productName: 'a b d' }, query, baseOptions), false);
  assert.equal(matchesShopSearchQuery({ productName: 'a f' }, query, baseOptions), false);
});

test('shop search query can search category when matchCategory is enabled', () => {
  const query = buildShopSearchQuery('openai');
  const row = { productName: 'plus', categoryName: 'openai' };
  assert.equal(
    matchesShopSearchQuery(row, query, { ...baseOptions, matchCategory: true }),
    true,
  );
  assert.equal(
    matchesShopSearchQuery(row, query, baseOptions),
    false,
  );
});
