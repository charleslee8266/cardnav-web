/**
 * 文件说明: 验证卡网商品预设搜索结果页 meta 生成契约。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildShopSearchPageMeta } from '../src/shop-search-page-meta.js';

test('shop search page meta shares title and description templates for page and hero', () => {
  const meta = buildShopSearchPageMeta('GPT Plus', {
    searchResultsTitle: '{term} related product search results',
    searchResultsDescription: 'Browse products related to {term}.',
    titleSuffix: 'CardNav',
  });

  assert.deepEqual(meta, {
    pageTitle: 'GPT Plus related product search results',
    pageDescription: 'Browse products related to GPT Plus.',
    heroTitle: 'GPT Plus related product search results',
    heroDescription: 'Browse products related to GPT Plus.',
    documentTitle: 'GPT Plus related product search results - CardNav',
  });
});
