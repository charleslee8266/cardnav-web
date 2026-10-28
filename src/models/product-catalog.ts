/**
 * 文件说明: 维护卡网商品页快速搜索和可索引预设搜索结果页的计划词真源。
 */
import { autoCategories, autoCategoryLabel } from '../shop-auto-category.js';
import { productMark } from './product-icons.js';
import { getModelFamilyIcon } from './family-icons.js';
import { gatewayFamilyPath, shopCategoryPath } from './routes.js';

export type QuickPlanSearchTerm = {
  label: string;
  query: string;
  slug: string;
  legacySlugs?: string[];
  legacyPlanName?: string;
  officialPriceSlug?: string;
  officialPriceSource?: { app: string; plan: string; legacySlugs: string[] };
  gatewayFamily?: string;
  gatewayFamilyName?: string;
};

type QuickPlanProduct = {
  id: string;
  label: string;
  icon: string;
  monochrome: boolean;
  symbol: string;
  gateway?: { id: string; name: string };
  defaultPlanSlug: string;
  hiddenFromQuickFilters?: boolean;
  plans: Omit<QuickPlanSearchTerm, 'label' | 'query' | 'gatewayFamily' | 'gatewayFamilyName'>[];
};

// Apple 的旧订阅仍独立存在，保留搜索与价格链接，不进入新套餐快捷菜单。
const grokAppStorePlans = ['supergrok-lite', 'supergrok', 'supergrok-plus', 'supergrok-heavy'] as const;

// 产品分组、图标和品牌关联只在这里定义；套餐继承所属产品的中转站入口。
const products: QuickPlanProduct[] = [
  { id: 'gpt', defaultPlanSlug: 'gpt-plus', label: 'GPT', ...productMark('gpt'), gateway: { id: 'gpt', name: 'GPT' }, symbol: '', plans: [
    { slug: 'gpt-free' },
    { slug: 'gpt-go', officialPriceSource: { app: 'chatgpt', plan: 'go-monthly', legacySlugs: ["chatgpt-go"] } },
    { slug: 'gpt-plus', officialPriceSource: { app: 'chatgpt', plan: 'plus', legacySlugs: ["chatgpt-plus"] } },
    { slug: 'gpt-pro-100', legacySlugs: ['gpt-pro-5x'], legacyPlanName: 'Pro 5x', officialPriceSource: { app: 'chatgpt', plan: 'pro-100', legacySlugs: ["chatgpt-pro-100", "chatgpt-pro-5x"] } },
    { slug: 'gpt-pro-200', legacySlugs: ['gpt-pro-20x'], legacyPlanName: 'Pro 20x', officialPriceSource: { app: 'chatgpt', plan: 'pro-200', legacySlugs: ["chatgpt-pro-200", "chatgpt-pro-20x"] } },
    { slug: 'gpt-pro-500', officialPriceSource: { app: 'chatgpt', plan: 'pro-500', legacySlugs: ["chatgpt-pro-500"] } },
    { slug: 'gpt-team' },
    { slug: 'gpt-team-5x' },
  ] },
  { id: 'claude', defaultPlanSlug: 'claude-pro', label: 'Claude', ...productMark('claude'), gateway: { id: 'claude', name: 'Claude' }, symbol: '', plans: [
    { slug: 'claude-free' },
    { slug: 'claude-pro', officialPriceSource: { app: 'claude', plan: 'pro', legacySlugs: [] } },
    { slug: 'claude-max-5x', officialPriceSource: { app: 'claude', plan: 'max-5x-monthly', legacySlugs: [] } },
    { slug: 'claude-max-20x', officialPriceSource: { app: 'claude', plan: 'max-20x-monthly', legacySlugs: [] } },
    { slug: 'claude-team' },
  ] },
  { id: 'gemini', defaultPlanSlug: 'gemini-pro', label: 'Gemini', ...productMark('gemini'), gateway: { id: 'gemini', name: 'Gemini' }, symbol: '', plans: [
    { slug: 'gemini-plus', legacySlugs: ['gemini-ai-plus'], officialPriceSource: { app: 'gemini', plan: 'ai-plus', legacySlugs: ["gemini-ai-plus"] } },
    { slug: 'gemini-pro', legacySlugs: ['gemini-ai-pro'], officialPriceSource: { app: 'gemini', plan: 'advanced', legacySlugs: ["gemini-advanced", "gemini-ai-pro"] } },
    { slug: 'gemini-ultra-5x', legacySlugs: ['gemini-ai-ultra', 'gemini-ultra'], officialPriceSource: { app: 'gemini', plan: 'ai-ultra', legacySlugs: ["gemini-ai-ultra"] } },
    { slug: 'gemini-ultra-20x' },
  ] },
  { id: 'grok', defaultPlanSlug: 'grok-plus', label: 'Grok', ...productMark('grok'), gateway: { id: 'grok', name: 'Grok' }, symbol: '', plans: [
    { slug: 'grok-free', officialPriceSlug: 'grok-free' },
    { slug: 'grok-plus', officialPriceSlug: 'grok-plus' },
    { slug: 'grok-premium', officialPriceSlug: 'grok-premium' },
    { slug: 'grok-super', officialPriceSlug: 'grok-super' },
    { slug: 'grok-ultra', officialPriceSlug: 'grok-ultra' },
  ] },
  { id: 'x', defaultPlanSlug: 'x-premium', label: 'X', ...productMark('x'), symbol: '𝕏', plans: [
    { slug: 'x-free' },
    { slug: 'x-premium', officialPriceSource: { app: 'x', plan: 'premium', legacySlugs: [] } },
    { slug: 'x-premium-plus', officialPriceSource: { app: 'x', plan: 'premium-plus', legacySlugs: [] } },
  ] },
  { id: 'cursor', defaultPlanSlug: 'cursor', label: autoCategoryLabel('cursor'), ...productMark('cursor'), symbol: '', plans: [{ slug: 'cursor', officialPriceSlug: 'cursor-pro' }] },
  { id: 'muse', defaultPlanSlug: 'muse', label: autoCategoryLabel('muse'), ...productMark('muse'), symbol: 'M', plans: [{ slug: 'muse' }] },
  { id: 'copilot', defaultPlanSlug: 'copilot', label: autoCategoryLabel('copilot'), ...productMark('copilot'), symbol: '', plans: [{ slug: 'copilot', officialPriceSlug: 'microsoft-365-personal' }] },
  { id: 'gmail', defaultPlanSlug: 'gmail', label: autoCategoryLabel('gmail'), ...productMark('gmail'), symbol: '', plans: [{ slug: 'gmail' }] },
  { id: 'outlook', defaultPlanSlug: 'outlook', label: autoCategoryLabel('outlook'), ...productMark('outlook'), symbol: '', plans: [{ slug: 'outlook' }] },
  { id: 'icloud', defaultPlanSlug: 'icloud', label: autoCategoryLabel('icloud'), ...productMark('icloud'), symbol: '', plans: [{ slug: 'icloud' }] },
  { id: 'apple-id', defaultPlanSlug: 'apple-id', label: autoCategoryLabel('apple-id'), ...productMark('apple-id'), symbol: '', plans: [{ slug: 'apple-id' }] },
  { id: 'api-gateway', defaultPlanSlug: 'api-gateway', label: autoCategoryLabel('api-gateway'), ...productMark('api-gateway'), symbol: '', plans: [{ slug: 'api-gateway' }] },
  { id: 'kyc', defaultPlanSlug: 'kyc', label: autoCategoryLabel('kyc'), ...productMark('kyc'), symbol: '', plans: [{ slug: 'kyc' }] },
  { id: 'phone-verification', defaultPlanSlug: 'phone-verification', label: autoCategoryLabel('phone-verification'), ...productMark('phone-verification'), symbol: '', plans: [{ slug: 'phone-verification' }] },
  { id: 'vcc', defaultPlanSlug: 'vcc', label: autoCategoryLabel('vcc'), ...productMark('vcc'), symbol: '', plans: [{ slug: 'vcc' }] },
  { id: 'paypal', defaultPlanSlug: 'paypal', hiddenFromQuickFilters: true, label: autoCategoryLabel('paypal'), ...productMark('paypal'), symbol: '', plans: [{ slug: 'paypal' }] },
  { id: 'telegram', defaultPlanSlug: 'telegram', label: autoCategoryLabel('telegram'), ...productMark('telegram'), symbol: '', plans: [{ slug: 'telegram' }] },
  { id: 'tiktok', defaultPlanSlug: 'tiktok', hiddenFromQuickFilters: true, label: autoCategoryLabel('tiktok'), ...productMark('tiktok'), symbol: '', plans: [{ slug: 'tiktok' }] },
];

export const quickPlanProducts = products.map(product => ({
  ...product,
  terms: product.plans.map(plan => ({
    ...plan,
    officialPriceSlug: plan.officialPriceSource ? plan.slug : plan.officialPriceSlug,
    label: autoCategoryLabel(plan.slug),
    query: `autocat: ${plan.slug}`,
    gatewayFamily: product.gateway?.id,
    gatewayFamilyName: product.gateway?.name,
  })),
}));

export function quickProductDefaultPlan(product: typeof quickPlanProducts[number]): QuickPlanSearchTerm {
  const plan = product.terms.find(term => term.slug === product.defaultPlanSlug);
  if (!plan) throw new Error(`Missing default plan for product: ${product.id}`);
  return plan;
}

export function quickProductSearchTerm(product: typeof quickPlanProducts[number]): QuickPlanSearchTerm {
  return {
    slug: product.id, label: product.label, query: quickProductSearchQuery(product.id),
    officialPriceSlug: quickProductDefaultPlan(product).officialPriceSlug,
    gatewayFamily: product.gateway?.id,
    gatewayFamilyName: product.gateway?.name,
  };
}

export const quickPlanSearchTerms: QuickPlanSearchTerm[] = [
  ...quickPlanProducts.flatMap(product => product.terms.some(term => term.slug === product.id)
    ? product.terms : [quickProductSearchTerm(product), ...product.terms]),
  ...grokAppStorePlans.map(slug => ({ slug, label: autoCategoryLabel(slug), query: `autocat: ${slug}`,
    officialPriceSlug: slug, gatewayFamily: 'grok', gatewayFamilyName: 'Grok' })),
];

export function productForAutoCategory(categoryId: string) {
  return quickPlanProducts.find(product => product.id === categoryId
    || categoryId.startsWith(`${product.id}-`)
    || product.terms.some(term => term.slug === categoryId)
    || (product.id === 'grok' && grokAppStorePlans.some(slug => slug === categoryId)));
}

export function autoCategoryIdsForFilter(id: string): string[] {
  if (!quickPlanProducts.some(product => product.id === id)) return [id];
  return autoCategories.filter(category => productForAutoCategory(category.id)?.id === id).map(category => category.id);
}

export function quickProductSearchQuery(productId: string) {
  return `autocat: ${productId}`;
}

export function quickPlanShortLabel(term: QuickPlanSearchTerm, productId: string) {
  return term.label.replace(/^(?:GPT|Claude|Gemini|Grok|X) /, '');
}

export function quickPlanSearchPath(term: QuickPlanSearchTerm) {
  const params = new URLSearchParams();
  params.set('q', term.query);
  params.set('sort', 'price-asc');
  return `/market?${params.toString()}`;
}

export function quickPlanSearchSeoPath(term: QuickPlanSearchTerm) {
  return shopCategoryPath(term.slug);
}

export function quickPlanGatewayPath(term: QuickPlanSearchTerm) {
  if (!term.gatewayFamily) return '';
  return gatewayFamilyPath(term.gatewayFamily);
}

export function quickPlanGatewayFamilyName(term: QuickPlanSearchTerm) {
  return productForAutoCategory(term.slug)?.label ?? term.label;
}

export function quickPlanSearchTermForSlug(slug: string | null | undefined) {
  const normalizedSlug = (slug || '').trim().toLowerCase();
  if (!normalizedSlug) return null;
  return quickPlanSearchTerms.find(term => term.slug === normalizedSlug)
    ?? quickPlanSearchTerms.find(term => term.legacySlugs?.includes(normalizedSlug)) ?? null;
}

export function quickPlanSearchTermForOfficialPriceSlug(slug: string | null | undefined) {
  const normalizedSlug = (slug || '').trim().toLowerCase();
  if (!normalizedSlug) return null;
  return quickPlanSearchTerms.find(term => term.slug === normalizedSlug && term.officialPriceSlug === normalizedSlug)
    ?? quickPlanSearchTerms.find(term => term.officialPriceSlug === normalizedSlug && (term.officialPriceSource || term.slug === 'cursor'))
    ?? quickPlanSearchTerms.find(term => term.slug === officialOnlyPlans.find(plan => plan.urlSlug === normalizedSlug)?.app) ?? null;
}

export function quickPlanDisplayName(term: QuickPlanSearchTerm | null, name = term?.label ?? '') {
  return term?.legacyPlanName ? `${name} (${name.replace(/Pro \d+$/, term.legacyPlanName)})` : name;
}

export function quickPlanHeroName(term: QuickPlanSearchTerm | null, name = term?.label ?? '') {
  return term?.legacyPlanName ? `${name} (${term.legacyPlanName.replace('Pro ', '')})` : name;
}



// Official subscriptions without a matching account tier still live in this product directory.
const officialOnlyPlans = [
  ...grokAppStorePlans.map(slug => ({ app: 'grok', plan: slug, appName: 'Grok',
    planName: `${autoCategoryLabel(slug)} · App Store`, displayName: `${autoCategoryLabel(slug)} · App Store`, urlSlug: slug })),
  { app: 'cursor', plan: 'pro', appName: 'Cursor', planName: 'Pro', displayName: 'Cursor Pro', urlSlug: 'cursor-pro' },
  { app: 'cursor', plan: 'pro-plus', appName: 'Cursor', planName: 'Pro+', displayName: 'Cursor Pro+', urlSlug: 'cursor-pro-plus' },
  { app: 'cursor', plan: 'ultra', appName: 'Cursor', planName: 'Ultra', displayName: 'Cursor Ultra', urlSlug: 'cursor-ultra' },
  { app: 'microsoft-365', plan: 'basic', appName: 'Microsoft 365 Copilot', planName: 'Basic', displayName: 'Microsoft 365 Basic', urlSlug: 'microsoft-365-basic' },
  { app: 'microsoft-365', plan: 'personal', appName: 'Microsoft 365 Copilot', planName: 'Personal', displayName: 'Microsoft 365 Personal', urlSlug: 'microsoft-365-personal' },
  { app: 'microsoft-365', plan: 'family', appName: 'Microsoft 365 Copilot', planName: 'Family', displayName: 'Microsoft 365 Family', urlSlug: 'microsoft-365-family' },
  { app: 'microsoft-365', plan: 'premium', appName: 'Microsoft 365 Copilot', planName: 'Premium', displayName: 'Microsoft 365 Premium', urlSlug: 'microsoft-365-premium' },
  { app: 'kimi', plan: 'moderato', appName: 'Kimi', planName: 'Moderato', displayName: 'Kimi Moderato', urlSlug: 'kimi-moderato' },
  { app: 'kimi', plan: 'allegretto', appName: 'Kimi', planName: 'Allegretto', displayName: 'Kimi Allegretto', urlSlug: 'kimi-allegretto' },
  { app: 'x', plan: 'basic', appName: 'X', planName: 'Basic', displayName: 'X Basic', urlSlug: 'x-basic' },
];

/** Official source keys are stable ingestion IDs; public identity comes from the category catalog. */
export function officialPlanIdentity(app: string, plan: string) {
  const product = quickPlanProducts.find(product => product.terms.some(term => term.officialPriceSource?.app === app && term.officialPriceSource.plan === plan));
  const term = product?.terms.find(term => term.officialPriceSource?.app === app && term.officialPriceSource.plan === plan);
  if (!product || !term) return officialOnlyPlans.find(item => item.app === app && item.plan === plan) ?? null;
  return { appName: product.label, planName: quickPlanShortLabel(term, product.id), displayName: term.label, urlSlug: term.slug };
}

export function canonicalOfficialPriceSlug(slug: string) {
  const normalized = slug.trim().toLowerCase();
  return quickPlanSearchTerms.find(term => term.officialPriceSource?.legacySlugs.includes(normalized))?.slug
    ?? officialOnlyPlans.find(plan => `${plan.app}-${plan.plan}` === normalized)?.urlSlug ?? normalized;
}

export function officialPriceStorageSlugs(slug: string) {
  const canonical = canonicalOfficialPriceSlug(slug);
  const term = quickPlanSearchTermForOfficialPriceSlug(canonical);
  const standalone = officialOnlyPlans.find(plan => plan.urlSlug === canonical);
  return [canonical, ...(term?.officialPriceSource?.legacySlugs ?? []), ...(standalone?.app === 'grok' ? [`grok-${standalone.plan}`] : [])];
}

export function productForOfficialPrice(appSlug: string, urlSlug: string) {
  const term = quickPlanSearchTermForOfficialPriceSlug(urlSlug);
  if (appSlug === 'microsoft-365') return { id: appSlug, label: 'Microsoft 365 Copilot', ...productMark('copilot'), symbol: '' };
  if (appSlug === 'kimi') {
    const mark = getModelFamilyIcon('Kimi');
    return { id: appSlug, label: 'Kimi', icon: mark.path, monochrome: mark.monochrome, symbol: '' };
  }
  return productForAutoCategory(term?.slug ?? appSlug);
}

// The retired standalone Copilot app no longer provides verifiable App Store prices.
export function isRetiredOfficialPrice(app: string) {
  return app === 'copilot';
}


/** Default official subscription for product families represented in this catalog. */
export function defaultOfficialPriceSlug(familyId: string) {
  const product = quickPlanProducts.find(product => product.gateway?.id === familyId);
  if (product) return quickProductDefaultPlan(product).officialPriceSlug ?? null;
  return officialOnlyPlans.find(plan => plan.app === familyId)?.urlSlug ?? null;
}

/** Select a published brand destination using its declared default, independently of menu order. */
export function defaultOfficialPricePlan<T extends { urlSlug: string }>(plans: readonly T[]): T | undefined {
  const product = quickPlanProducts.find(item => item.terms.some(term => plans.some(plan => plan.urlSlug === term.officialPriceSlug)));
  const defaultSlug = product && quickProductDefaultPlan(product).officialPriceSlug;
  return plans.find(plan => plan.urlSlug === defaultSlug) ?? plans[0];
}

/** 官网标准美元月费；独立于 App Store 地区订阅，促销与税费以结账页为准。 */
export const grokWebSubscription = {
  sourceUrl: 'https://grok.com/plans',
  reviewedOn: '2026-10-28',
  plans: [
    { slug: 'grok-free', monthlyUsd: 0 },
    { slug: 'grok-plus', monthlyUsd: 8 },
    { slug: 'grok-premium', monthlyUsd: 30 },
    { slug: 'grok-super', monthlyUsd: 100 },
    { slug: 'grok-ultra', monthlyUsd: 200 },
  ],
} as const;

export function officialWebPriceCatalog() {
  return grokWebSubscription.plans.map((plan, index) => ({
    appSlug: 'grok', planSlug: plan.slug, urlSlug: plan.slug,
    appName: 'Grok', planName: autoCategoryLabel(plan.slug).replace(/^Grok /, ''),
    displayName: autoCategoryLabel(plan.slug), isDefault: plan.slug === 'grok-plus', displayOrder: 4000 + index,
  }));
}

/** 官网当前套餐优先，旧 App Store 套餐保持独立且排在其后。 */
export function officialPriceDisplayOrder(app: string, plan: string, storedOrder: number) {
  if (app !== 'grok') return storedOrder;
  const webIndex = grokWebSubscription.plans.findIndex(item => item.slug === plan);
  if (webIndex >= 0) return 4000 + webIndex;
  const appStoreIndex = grokAppStorePlans.findIndex(slug => slug === plan);
  return appStoreIndex >= 0 ? 4101 + appStoreIndex : storedOrder;
}
