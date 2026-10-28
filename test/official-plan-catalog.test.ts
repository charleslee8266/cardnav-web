/** 文件说明: 验证套餐身份、快捷入口及官方价格历史链接。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { quickPlanProducts, quickProductDefaultPlan, quickProductSearchTerm, canonicalOfficialPriceSlug, officialPlanIdentity, officialPriceStorageSlugs, quickPlanSearchTermForSlug, productForAutoCategory, productForOfficialPrice, quickPlanSearchTermForOfficialPriceSlug, autoCategoryIdsForFilter, isRetiredOfficialPrice } from '../src/models/product-catalog.js';

test('official plans share category identities and link back to the same product', () => {
  for (const [app, plan, slug, name] of [
    ['chatgpt', 'plus', 'gpt-plus', 'GPT Plus'],
    ['gemini', 'ai-plus', 'gemini-plus', 'Gemini Plus'],
    ['gemini', 'advanced', 'gemini-pro', 'Gemini Pro'],
    ['gemini', 'ai-ultra', 'gemini-ultra-5x', 'Gemini Ultra 5x'],
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
  for (const [product, slug] of [['gpt','gpt-plus'], ['claude','claude-pro'], ['gemini','gemini-pro'], ['cursor','cursor-pro'], ['x','x-premium'], ['copilot','microsoft-365-personal']]) {
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
  for (const [id, slug] of [['gpt', 'gpt-plus'], ['claude', 'claude-pro'], ['gemini', 'gemini-pro'], ['grok', 'grok-plus'], ['x', 'x-premium']]) {
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
  const kimi = productForOfficialPrice('kimi', 'kimi-plus')!;
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
  assert.equal(familyRelatedPaths('Kimi').officialPath, '/official-price/kimi-plus');
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


test('Grok lists current and SuperGrok tiers without mixing their official price identities', () => {
  const product = quickPlanProducts.find(product => product.id === 'grok')!;
  const currentSlugs = ['grok-free', 'grok-plus', 'grok-premium', 'grok-super', 'grok-ultra'];
  const legacySlugs = ['supergrok-lite', 'supergrok', 'supergrok-plus', 'supergrok-heavy'];
  assert.deepEqual(product.terms.map(term => term.slug), [...currentSlugs, ...legacySlugs]);
  for (const slug of currentSlugs) {
    const term = quickPlanSearchTermForSlug(slug)!;
    assert.match(term.label, /^Grok /);
    assert.equal(term.query, `autocat: ${slug}`);
    assert.equal(term.officialPriceSlug, undefined);
  }
  assert.equal(quickProductDefaultPlan(product).slug, 'grok-plus');
  for (const slug of legacySlugs) {
    const term = quickPlanSearchTermForSlug(slug)!;
    assert.match(term.label, /^SuperGrok(?: |$)/);
    assert.equal(term.officialPriceSlug, slug);
    assert.equal(term.query, `autocat: ${slug}`);
    assert.equal(officialPlanIdentity('grok', slug)?.displayName, term.label);
    assert.equal(officialPlanIdentity('grok', slug)?.urlSlug, slug);
    assert.equal(canonicalOfficialPriceSlug(`grok-${slug}`), slug);
    assert.deepEqual(officialPriceStorageSlugs(slug), [slug, `grok-${slug}`]);
    assert.ok(autoCategoryIdsForFilter('grok').includes(slug));
  }
});


test('Grok current and legacy price destinations retain distinct labels in one product', async () => {
  const { quickPlanShortLabel, defaultOfficialPricePlan } = await import('../src/models/product-catalog.js');
  const current = quickPlanSearchTermForSlug('grok-plus')!;
  const legacy = quickPlanSearchTermForSlug('supergrok-plus')!;
  assert.equal(quickPlanShortLabel(current, 'grok'), 'Plus');
  assert.equal(quickPlanShortLabel(legacy, 'grok'), 'SuperGrok Plus');
  assert.equal(productForOfficialPrice('grok', legacy.officialPriceSlug!)?.id, 'grok');
  assert.equal(officialPlanIdentity('grok', 'supergrok-plus')?.displayName, 'SuperGrok Plus');
});


test('verified Hailuo video subscriptions keep their official plan identity and one brand', () => {
  for (const [plan, name] of [['video-basic', '基础会员'], ['video-standard', '标准会员'], ['video-premium', '尊享会员']]) {
    const identity = officialPlanIdentity('hailuo', plan)!;
    assert.equal(identity.appName, '海螺视频');
    assert.equal(identity.displayName, `海螺视频${name}`);
    assert.equal(identity.urlSlug, `hailuo-${plan}`);
    assert.equal(productForOfficialPrice('hailuo', identity.urlSlug)?.label, '海螺视频');
    assert.equal(quickPlanSearchTermForOfficialPriceSlug(identity.urlSlug), null);
  }
});


test('verified Kling video subscriptions use the China app identity', () => {
  for (const [plan, name] of [['video-gold', '黄金会员'], ['video-platinum', '铂金会员']]) {
    const identity = officialPlanIdentity('kling', plan)!;
    assert.equal(identity.appName, '可灵视频');
    assert.equal(identity.displayName, `可灵视频${name}`);
    assert.equal(identity.urlSlug, `kling-${plan}`);
    assert.equal(productForOfficialPrice('kling', identity.urlSlug)?.label, '可灵视频');
    assert.equal(quickPlanSearchTermForOfficialPriceSlug(identity.urlSlug), null);
  }
});


test('verified Qingyan SVIP keeps its App Store subscription identity', () => {
  const identity = officialPlanIdentity('glm', 'svip')!;
  assert.equal(identity.appName, '智谱清言');
  assert.equal(identity.displayName, '智谱清言 SVIP');
  assert.equal(identity.urlSlug, 'glm-svip');
  assert.equal(productForOfficialPrice('glm', identity.urlSlug)?.label, '智谱清言');
});


test('verified Doubao and Jimeng subscriptions retain the exact approved plans', () => {
  for (const [app, plan, name] of [['doubao', 'standard', '豆包专业版标准套餐'], ['doubao', 'plus', '豆包专业版加强套餐'], ['doubao', 'premium', '豆包专业版高级套餐'], ['jimeng', 'video-basic', '即梦视频基础会员']]) {
    const identity = officialPlanIdentity(app, plan)!;
    assert.equal(identity.displayName, name);
    assert.equal(identity.urlSlug, `${app}-${plan}`);
    assert.equal(productForOfficialPrice(app, identity.urlSlug)?.label, identity.appName);
  }
});


test('Kimi monthly plans are independent from stored offers with an unknown billing period', () => {
  for (const plan of ['plus', 'pro']) {
    const identity = officialPlanIdentity('kimi', plan)!;
    assert.equal(identity.urlSlug, `kimi-${plan}`);
    assert.equal(identity.displayName, `Kimi ${plan === 'plus' ? 'Plus' : 'Pro'}`);
    assert.equal(isRetiredOfficialPrice('kimi', plan), false);
    assert.deepEqual(officialPriceStorageSlugs(identity.urlSlug), [identity.urlSlug]);
  }
  for (const plan of ['moderato', 'allegretto']) {
    assert.equal(isRetiredOfficialPrice('kimi', plan), true);
    assert.equal(officialPlanIdentity('kimi', plan), null);
    assert.equal(canonicalOfficialPriceSlug(`kimi-${plan}`), `kimi-${plan}`);
  }
});


test('international Kling subscriptions remain a separate official app from China Kling', () => {
  for (const plan of ['standard', 'pro', 'premier', 'ultra']) {
    const identity = officialPlanIdentity('kling-global', plan)!;
    assert.equal(identity.urlSlug, `kling-global-${plan}`);
    assert.equal(identity.appName, 'Kling AI 国际版');
    assert.equal(productForOfficialPrice('kling-global', identity.urlSlug)?.id, 'kling-global');
    assert.deepEqual(officialPriceStorageSlugs(identity.urlSlug), [identity.urlSlug]);
  }
  assert.equal(productForOfficialPrice('kling', 'kling-video-gold')?.id, 'kling');
});


test('Dreamina international plans do not inherit China Jimeng price identities', () => {
  for (const plan of ['basic', 'standard', 'advanced']) {
    const identity = officialPlanIdentity('dreamina', plan)!;
    assert.equal(identity.urlSlug, `dreamina-${plan}`);
    assert.equal(identity.appName, 'Dreamina 国际版');
    assert.equal(productForOfficialPrice('dreamina', identity.urlSlug)?.id, 'dreamina');
    assert.deepEqual(officialPriceStorageSlugs(identity.urlSlug), [identity.urlSlug]);
  }
  assert.equal(productForOfficialPrice('jimeng', 'jimeng-video-basic')?.id, 'jimeng');
});
