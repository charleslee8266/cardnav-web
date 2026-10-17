import test from 'node:test';
import assert from 'node:assert/strict';
import { quickPlanProducts, quickProductDefaultPlan, quickProductSearchTerm, canonicalOfficialPriceSlug, officialPlanIdentity, officialPriceStorageSlugs, quickPlanSearchTermForSlug, productForAutoCategory, productForOfficialPrice, quickPlanSearchTermForOfficialPriceSlug } from '../src/models/product-catalog.js';

test('official plans share category identities and link back to the same product', () => {
  for (const [app, plan, slug, name] of [
    ['chatgpt', 'plus', 'gpt-plus', 'GPT Plus'],
    ['gemini', 'ai-plus', 'gemini-plus', 'Gemini Plus'],
    ['gemini', 'advanced', 'gemini-pro', 'Gemini Pro'],
    ['gemini', 'ai-ultra', 'gemini-ultra-5x', 'Gemini Ultra 5x'],
    ['grok', 'supergrok-lite', 'supergrok-lite', 'SuperGrok Lite'],
    ['grok', 'supergrok-plus', 'supergrok-plus', 'SuperGrok Plus'],
  ]) {
    const identity = officialPlanIdentity(app, plan)!;
    const term = quickPlanSearchTermForOfficialPriceSlug(identity.urlSlug)!;
    assert.equal(identity.urlSlug, slug);
    assert.equal(identity.displayName, name);
    assert.equal(term.slug, slug);
    assert.equal(term.label, identity.displayName);
    assert.ok(productForAutoCategory(term.slug)?.icon);
  }
});

test('legacy official links resolve to canonical categories and still read old stored prices', () => {
  for (const [legacy, canonical] of [['gemini-ai-plus', 'gemini-plus'], ['gemini-advanced', 'gemini-pro'], ['grok-supergrok-lite', 'supergrok-lite'], ['chatgpt-pro-5x', 'gpt-pro-100']]) {
    assert.equal(canonicalOfficialPriceSlug(legacy), canonical);
    assert.equal(canonicalOfficialPriceSlug(canonical), canonical);
    assert.ok(officialPriceStorageSlugs(canonical).includes(legacy));
  }
  assert.equal(canonicalOfficialPriceSlug('copilot-pro'), 'copilot-pro');
});

test('official Cursor tiers link to the existing Cursor account category', () => {
  for (const plan of ['pro', 'pro-plus', 'ultra']) {
    const identity = officialPlanIdentity('cursor', plan)!;
    assert.equal(quickPlanSearchTermForOfficialPriceSlug(identity.urlSlug)?.slug, 'cursor');
  }
  assert.equal(officialPlanIdentity('microsoft-365', 'personal')?.displayName, 'Microsoft 365 Personal');
  assert.equal(quickPlanSearchTermForOfficialPriceSlug('microsoft-365-personal'), null);
});


test('all-product pages default to a standard official plan without replacing specific tier links', () => {
  for (const [product, slug] of [['gpt','gpt-plus'], ['claude','claude-pro'], ['gemini','gemini-pro'], ['grok','supergrok'], ['cursor','cursor-pro'], ['x','x-premium'], ['copilot','microsoft-365-personal']]) {
    assert.equal(quickPlanSearchTermForSlug(product)?.officialPriceSlug, slug);
  }
  assert.equal(quickPlanSearchTermForOfficialPriceSlug('gpt-plus')?.slug, 'gpt-plus');
  assert.equal(quickPlanSearchTermForSlug('gpt-pro-500')?.officialPriceSlug, 'gpt-pro-500');
  assert.equal(quickPlanSearchTermForSlug('muse')?.officialPriceSlug, undefined);
});


test('product defaults select a concrete category and share its official price destination', () => {
  for (const product of quickPlanProducts) {
    const plan = quickProductDefaultPlan(product);
    assert.ok(product.terms.some(term => term.slug === plan.slug));
    assert.equal(plan.query, `autocat: ${plan.slug}`);
    assert.equal(quickProductSearchTerm(product).officialPriceSlug, plan.officialPriceSlug);
    if (product.terms.length > 1) assert.notEqual(plan.slug, product.id);
  }
  for (const [id, slug] of [['gpt', 'gpt-plus'], ['claude', 'claude-pro'], ['gemini', 'gemini-pro'], ['grok', 'supergrok'], ['x', 'x-premium']]) {
    assert.equal(quickProductDefaultPlan(quickPlanProducts.find(product => product.id === id)!).slug, slug);
    assert.equal(quickPlanSearchTermForSlug(id)?.query, `autocat: ${id}`);
  }
});


test('shared routes encode model identities and shared brands keep the same marks', async () => {
  const { gatewayModelPath, gatewayFamilyPath } = await import('../src/models/routes.js');
  const { productIconPath } = await import('../src/models/product-icons.js');
  const { getModelFamilyIcon } = await import('../src/models/family-icons.js');
  assert.equal(gatewayModelPath('google/gemma-3'), '/llm-gateway/models/google%2Fgemma-3');
  assert.equal(gatewayModelPath('google/gemma-3', '/en/llm-gateway/models'), '/en/llm-gateway/models/google%2Fgemma-3');
  assert.equal(gatewayFamilyPath('GPT'), '/llm-gateway?family=gpt');
  for (const id of ['gpt', 'claude', 'gemini', 'grok', 'muse']) {
    const product = quickPlanProducts.find(product => product.id === id)!;
    assert.equal(productIconPath(product.icon), getModelFamilyIcon(product.label).path);
    assert.equal(product.monochrome, getModelFamilyIcon(product.label).monochrome);
  }
  const kimi = productForOfficialPrice('kimi', 'kimi-moderato')!;
  assert.equal(productIconPath(kimi.icon), getModelFamilyIcon('Kimi').path);
});

test('family links require published destinations and shop links cover the whole family', async () => {
  const { createFamilyNavigation } = await import('../src/models/family-navigation.js');
  const link = createFamilyNavigation(['GPT', 'Claude', 'Qwen'], ['gpt-plus', 'claude-pro', 'kimi']);
  assert.deepEqual(link('GPT'), { gatewayPath: '/llm-gateway?family=gpt', shopPath: '/market/category/gpt' });
  assert.deepEqual(link('Qwen'), { gatewayPath: '/llm-gateway?family=qwen', shopPath: null });
  assert.deepEqual(link('Kimi'), { gatewayPath: null, shopPath: '/market?q=autocat%3A+kimi' });
  assert.deepEqual(link(null), { gatewayPath: null, shopPath: null });
});

test('family cross-links use default subscriptions and omit unavailable destinations', async () => {
  const { familyRelatedPaths } = await import('../src/models/family-navigation.js');
  assert.equal(familyRelatedPaths('GPT').officialPath, '/official-price/gpt-plus');
  assert.equal(familyRelatedPaths('GPT').shopPath, '/market/category/gpt-plus');
  assert.equal(familyRelatedPaths('Claude').officialPath, '/official-price/claude-pro');
  assert.equal(familyRelatedPaths('DeepSeek').officialPath, null);
  assert.match(familyRelatedPaths('DeepSeek').shopPath ?? '', /deepseek/);
  assert.equal(familyRelatedPaths('Kimi').officialPath, '/official-price/kimi-moderato');
  assert.equal(familyRelatedPaths('unknown').shopPath, null);
  assert.equal(familyRelatedPaths(null).leaderboardPath, null);
});

test('official brand destinations use declared defaults even when cheaper plans precede them', async () => {
  const { defaultOfficialPricePlan } = await import('../src/models/product-catalog.js');
  for (const [slugs, expected] of [
    [['gpt-go', 'gpt-pro-500', 'gpt-plus'], 'gpt-plus'],
    [['claude-max-20x', 'claude-pro', 'claude-max-5x'], 'claude-pro'],
    [['gemini-plus', 'gemini-ultra-5x', 'gemini-pro'], 'gemini-pro'],
  ] as const) {
    const plans = slugs.map(urlSlug => ({urlSlug, pathname: `/official-price/${urlSlug}`}));
    assert.equal(defaultOfficialPricePlan(plans)?.urlSlug, expected);
    assert.equal(defaultOfficialPricePlan([...plans].reverse())?.urlSlug, expected);
  }
});
