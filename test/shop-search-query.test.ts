/**
 * 文件说明: 验证卡网商品页高级搜索解析与字段匹配行为。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildShopSearchQuery, matchesShopSearchQuery } from '../src/shop-search-query.js';

import { quickPlanSearchTermForSlug, quickPlanGatewayPath, quickPlanProducts, quickProductSearchQuery } from '../src/models/product-catalog.js';
import { gatewayProviderSlug } from '../src/models/routes.js';

const baseOptions = { matchCategory: false, matchMerchant: false, fuzzy: false };

test('fuzzy search matches normalized substrings only when enabled', () => {
  const query = buildShopSearchQuery('ＣｈａｔＧＰＴ');
  assert.equal(
    matchesShopSearchQuery({ productName: 'chatgpt plus' }, query, { ...baseOptions, fuzzy: true }),
    true,
  );
  assert.equal(
    matchesShopSearchQuery({ productName: 'claude plus' }, query, { ...baseOptions, fuzzy: true }),
    false,
  );
});

test('fuzzy search tolerates a limited product-name typo', () => {
  const query = buildShopSearchQuery('chbt gpt');
  assert.equal(
    matchesShopSearchQuery({ productName: 'chat gpt plus' }, query, { ...baseOptions, fuzzy: true }),
    true,
  );
  assert.equal(
    matchesShopSearchQuery({ productName: 'chat gpt plus' }, query, baseOptions),
    false,
  );
});

test('fuzzy search tolerates a missing or extra product-name character', () => {
  assert.equal(
    matchesShopSearchQuery(
      { productName: 'chatgpt plus' },
      buildShopSearchQuery('chatgp'),
      { ...baseOptions, fuzzy: true },
    ),
    true,
  );
  assert.equal(
    matchesShopSearchQuery(
      { productName: 'chatgpt plus' },
      buildShopSearchQuery('chatgptx'),
      { ...baseOptions, fuzzy: true },
    ),
    true,
  );
});

test('fuzzy search can match category when the category option is enabled', () => {
  const query = buildShopSearchQuery('open');
  assert.equal(
    matchesShopSearchQuery({ productName: 'plus', categoryName: 'openai' }, query, { ...baseOptions, matchCategory: true, fuzzy: true }),
    true,
  );
});

test('fuzzy search preserves advanced query semantics', () => {
  const query = buildShopSearchQuery('gpt -(free|普号)');
  assert.equal(matchesShopSearchQuery({ productName: 'gpt free' }, query, { ...baseOptions, fuzzy: true }), false);
});

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

test('category qualifier searches only the category field without the category toggle', () => {
  const query = buildShopSearchQuery('category:openai');
  const row = { productName: 'openai plus', categoryName: 'chatgpt' };
  assert.equal(matchesShopSearchQuery(row, query, baseOptions), false);
  assert.equal(
    matchesShopSearchQuery({ ...row, categoryName: 'openai' }, query, baseOptions),
    true,
  );
  assert.equal(
    matchesShopSearchQuery(row, query, { ...baseOptions, matchCategory: true }),
    false,
  );
});

test('category qualifier can be combined with an unqualified product term', () => {
  const query = buildShopSearchQuery('category:openai gpt');
  assert.equal(
    matchesShopSearchQuery({ productName: 'gpt plus', categoryName: 'openai' }, query, baseOptions),
    true,
  );
  assert.equal(
    matchesShopSearchQuery({ productName: 'openai plus', categoryName: 'gpt' }, query, baseOptions),
    false,
  );
});

test('field qualifiers keep working inside OR expressions', () => {
  const query = buildShopSearchQuery('a | category:b');
  assert.equal(
    matchesShopSearchQuery({ productName: 'a product', categoryName: 'other' }, query, baseOptions),
    true,
  );
  assert.equal(
    matchesShopSearchQuery({ productName: 'other product', categoryName: 'b' }, query, baseOptions),
    true,
  );
  assert.equal(
    matchesShopSearchQuery({ productName: 'other product', categoryName: 'other' }, query, baseOptions),
    false,
  );
});

test('shop search query can search merchant URL when matchMerchant is enabled', () => {
  const query = buildShopSearchQuery('example-card.com');
  const row = { productName: 'plus', siteText: 'example card', siteUrl: 'https://example-card.com' };
  assert.equal(
    matchesShopSearchQuery(row, query, { ...baseOptions, matchMerchant: true }),
    true,
  );
  assert.equal(
    matchesShopSearchQuery(row, query, baseOptions),
    false,
  );
});

test('site qualifier searches merchant names and URLs without the merchant toggle', () => {
  const query = buildShopSearchQuery('site:example-card.com');
  assert.equal(
    matchesShopSearchQuery({ productName: 'plus', siteText: 'Example Cards', siteUrl: 'https://example-card.com' }, query, baseOptions),
    true,
  );
  assert.equal(
    matchesShopSearchQuery({ productName: 'plus', siteText: 'Example Cards', siteUrl: 'https://other.example' }, query, baseOptions),
    false,
  );
});

test('quick searches select stored Pro tiers and preserve legacy route aliases', () => {
  const products = [
    { productName: '基础月卡', autoCategory: 'gpt-pro-100' },
    { productName: '专业月卡', autoCategory: 'gpt-pro-200' },
    { productName: '高级月卡', autoCategory: 'gpt-pro-500' },
    { productName: 'GPT Pro 500 接码', autoCategory: 'phone-verification' },
  ];
  for (const [index, slug] of ['gpt-pro-100', 'gpt-pro-200', 'gpt-pro-500'].entries()) {
    const term = quickPlanSearchTermForSlug(slug)!;
    const query = buildShopSearchQuery(term.query);
    assert.deepEqual(products.filter(row => matchesShopSearchQuery(row, query, baseOptions)), [products[index]]);
  }
  assert.equal(quickPlanSearchTermForSlug('gpt-pro-5x')?.slug, 'gpt-pro-100');
  assert.equal(quickPlanSearchTermForSlug('gpt-pro-20x')?.slug, 'gpt-pro-200');
});

test('new quick categories filter stored values and Gemini legacy routes resolve to current slugs', () => {
  const slugs = ['gemini-ultra-5x', 'gemini-ultra-20x', 'gemini-pro', 'gemini-plus', 'kyc', 'grok-free', 'supergrok-lite', 'muse'];
  const products = slugs.map(autoCategory => ({ productName: '商品', autoCategory }));
  for (const slug of slugs) {
    const term = quickPlanSearchTermForSlug(slug)!;
    assert.deepEqual(products.filter(row => matchesShopSearchQuery(row, buildShopSearchQuery(term.query), baseOptions)).map(row => row.autoCategory), [slug]);
  }
  assert.equal(quickPlanSearchTermForSlug('gemini-ai-ultra')?.slug, 'gemini-ultra-5x');
  assert.equal(quickPlanSearchTermForSlug('gemini-ai-pro')?.slug, 'gemini-pro');
  assert.equal(quickPlanSearchTermForSlug('gemini-ai-plus')?.slug, 'gemini-plus');
});


test('all plans inherit gateway links from their product including Free and Lite tiers', () => {
  for (const product of quickPlanProducts.filter(product => product.gateway)) {
    for (const term of product.terms) {
      assert.equal(quickPlanGatewayPath(term), `/llm-gateway?family=${product.gateway!.id}`);
      assert.equal(term.gatewayFamilyName, product.gateway!.name);
    }
  }
  assert.equal(quickPlanGatewayPath(quickPlanSearchTermForSlug('claude-free')!), '/llm-gateway?family=claude');
  assert.equal(quickPlanGatewayPath(quickPlanSearchTermForSlug('kyc')!), '');
});


test('product selection includes all its plans without including gateways or other brands', () => {
  assert.equal(quickProductSearchQuery('gpt'), 'autocat: gpt');
  const query = buildShopSearchQuery('autocat: gpt');
  for (const autoCategory of ['gpt-free', 'gpt-plus', 'gpt-team', 'gpt-team-5x', 'gpt-pro-100', 'gpt-pro-200', 'gpt-pro-500']) {
    assert.equal(matchesShopSearchQuery({ productName: '商品', autoCategory }, query, baseOptions), true);
  }
  for (const autoCategory of ['claude-free', 'api-gateway', 'kyc']) {
    assert.equal(matchesShopSearchQuery({ productName: 'GPT Plus', autoCategory }, query, baseOptions), false);
  }
});


test('price bounds are inclusive CNY filters and compose with categories and OR', () => {
  const row = { productName: 'GPT Plus', autoCategory: 'gpt-plus', priceNumber: 10, priceUnit: '¥' };
  const match = (text: string, overrides = {}) => matchesShopSearchQuery({ ...row, ...overrides }, buildShopSearchQuery(text), baseOptions);
  assert.equal(match('autocat:gpt priceMin:10 priceMax:10'), true);
  assert.equal(match('priceMin:10.01'), false);
  assert.equal(match('priceMax:9.99'), false);
  assert.equal(match('(priceMax:5|priceMin:10) GPT'), true);
  assert.equal(match('priceMin: 10 priceMax: 20'), true);
  assert.equal(match('priceMin:14 priceMax:14', { priceNumber: 2, priceUnit: 'USD' }), true);
  assert.equal(match('priceMax:100', { priceNumber: null }), false);
  assert.equal(match('priceMax:100', { priceUnit: 'unknown' }), false);
  assert.equal(match('priceMin:nope'), false);
  assert.equal(match('priceMin:-1'), false);
  assert.equal(match('priceMax:0', { priceNumber: 0 }), true);
});


test('brand aliases match both query and product spelling without changing scoped identifiers', () => {
  for (const query of ['Codex Plus', 'G Plus', '鸡屁踢 Plus', 'GPT Plus']) {
    for (const productName of ['Codex Plus', 'G Plus', '鸡屁踢 Plus', 'GPT Plus']) {
      assert.equal(matchesShopSearchQuery({ productName }, buildShopSearchQuery(query), baseOptions), true, `${query} → ${productName}`);
    }
  }
  for (const [query, productName] of [['grok', 'gro free'], ['grok', 'gr0k Heavy'], ['claude', 'c1aude 普号']]) {
    assert.equal(matchesShopSearchQuery({ productName }, buildShopSearchQuery(query), baseOptions), true);
  }
  assert.equal(matchesShopSearchQuery({ productName: 'Gmail' }, buildShopSearchQuery('G'), baseOptions), false);
  assert.equal(matchesShopSearchQuery({ productName: 'GPT Plus', siteUrl: 'https://codex.example' }, buildShopSearchQuery('site:codex.example'), baseOptions), true);
  assert.equal(matchesShopSearchQuery({ productName: 'Codex Plus', autoCategory: 'gpt-plus' }, buildShopSearchQuery('autocat:codex'), baseOptions), false);
  assert.equal(matchesShopSearchQuery({ productName: 'G Plus' }, buildShopSearchQuery('GPT -Codex'), baseOptions), false);
});


test('gateway providers use lowercase URL slugs including multi-word names', () => {
  assert.equal(gatewayProviderSlug('OpenAI'), 'openai');
  assert.equal(gatewayProviderSlug('Black Forest Labs'), 'black-forest-labs');
  assert.equal(gatewayProviderSlug('Stability AI'), 'stability-ai');
  assert.equal(gatewayProviderSlug('Z.ai'), 'z-ai');
});
