/**
 * 文件说明: 维护卡网商品页快速搜索和可索引预设搜索结果页的计划词真源。
 */
export type QuickPlanSearchTerm = {
  label: string;
  query: string;
  slug: string;
  officialPriceSlug?: string;
  gatewayModelFamily?: string;
  gatewayModelFamilyName?: string;
};

export const quickPlanSearchTerms: QuickPlanSearchTerm[] = [
  { label: 'GPT Free', query: 'gpt (free|普号|白号)', slug: 'gpt-free', gatewayModelFamily: 'gpt', gatewayModelFamilyName: 'GPT' },
  { label: 'GPT Go', query: 'gpt go', slug: 'gpt-go', officialPriceSlug: 'chatgpt-go', gatewayModelFamily: 'gpt', gatewayModelFamilyName: 'GPT' },
  { label: 'GPT Plus', query: 'gpt plus -(free|普号)', slug: 'gpt-plus', officialPriceSlug: 'chatgpt-plus', gatewayModelFamily: 'gpt', gatewayModelFamilyName: 'GPT' },
  { label: 'GPT Pro 5x', query: 'gpt pro 5x', slug: 'gpt-pro-5x', officialPriceSlug: 'chatgpt-pro-5x', gatewayModelFamily: 'gpt', gatewayModelFamilyName: 'GPT' },
  { label: 'GPT Pro 20x', query: 'gpt pro 20x', slug: 'gpt-pro-20x', officialPriceSlug: 'chatgpt-pro-20x', gatewayModelFamily: 'gpt', gatewayModelFamilyName: 'GPT' },

  { label: 'Claude Pro', query: 'claude pro', slug: 'claude-pro', officialPriceSlug: 'claude-pro', gatewayModelFamily: 'claude', gatewayModelFamilyName: 'Claude' },
  { label: 'Claude Max 5x', query: 'claude 5x', slug: 'claude-max-5x', officialPriceSlug: 'claude-max-5x', gatewayModelFamily: 'claude', gatewayModelFamilyName: 'Claude' },
  { label: 'Claude Max 20x', query: 'claude (20x|200)', slug: 'claude-max-20x', officialPriceSlug: 'claude-max-20x', gatewayModelFamily: 'claude', gatewayModelFamilyName: 'Claude' },

  // { label: 'Gemini AI Plus', query: 'gemini plus', slug: 'gemini-ai-plus' },
  { label: 'Gemini Pro', query: 'gemini pro', slug: 'gemini-ai-pro', officialPriceSlug: 'gemini-advanced', gatewayModelFamily: 'gemini', gatewayModelFamilyName: 'Gemini' },
  { label: 'Gemini Ultra', query: 'gemini ultra', slug: 'gemini-ai-ultra', officialPriceSlug: 'gemini-ai-ultra', gatewayModelFamily: 'gemini', gatewayModelFamilyName: 'Gemini' },

  { label: 'SuperGrok', query: '(supergrok|super grok)', slug: 'supergrok', officialPriceSlug: 'grok-supergrok', gatewayModelFamily: 'grok', gatewayModelFamilyName: 'Grok' },
  { label: 'SuperGrok Heavy', query: 'grok heavy', slug: 'supergrok-heavy', officialPriceSlug: 'grok-supergrok-heavy', gatewayModelFamily: 'grok', gatewayModelFamilyName: 'Grok' },
  { label: 'X Premium', query: 'x premium -premium+', slug: 'x-premium', officialPriceSlug: 'x-premium' },
  { label: 'X Premium+', query: 'x (premium plus|premium+)', slug: 'x-premium-plus', officialPriceSlug: 'x-premium-plus' },

  { label: '接码', query: '接码 -(free|plus|pay)', slug: 'phone-verification' },

  { label: 'Cursor', query: 'cursor', slug: 'cursor' },

  { label: 'Gmail', query: 'gmail -(gpt|claude)', slug: 'gmail' },
  { label: 'Outlook', query: 'outlook -gpt', slug: 'outlook' },
  { label: 'Tiktok', query: 'tiktok', slug: 'tiktok' },
  { label: 'PayPal', query: 'paypal', slug: 'paypal' },
  { label: 'Telegram', query: 'telegram', slug: 'telegram' },
];

export function quickPlanSearchPath(term: QuickPlanSearchTerm) {
  const params = new URLSearchParams();
  params.set('q', term.query);
  params.set('sort', 'price-asc');
  return `/shops?${params.toString()}`;
}

export function quickPlanSearchSeoPath(term: QuickPlanSearchTerm) {
  return `/shops/${term.slug}`;
}

export function quickPlanGatewayPath(term: QuickPlanSearchTerm) {
  if (!term.gatewayModelFamily) return '';
  const params = new URLSearchParams();
  params.set('model', term.gatewayModelFamily);
  return `/llm-gateway?${params.toString()}`;
}

export function quickPlanGatewayFamilyName(term: QuickPlanSearchTerm) {
  return term.gatewayModelFamilyName ?? term.gatewayModelFamily ?? term.label;
}

export function quickPlanSearchTermForSlug(slug: string | null | undefined) {
  const normalizedSlug = (slug || '').trim().toLowerCase();
  if (!normalizedSlug) return null;
  return quickPlanSearchTerms.find(term => term.slug === normalizedSlug) ?? null;
}

export function quickPlanSearchTermForOfficialPriceSlug(slug: string | null | undefined) {
  const normalizedSlug = (slug || '').trim().toLowerCase();
  if (!normalizedSlug) return null;
  return quickPlanSearchTerms.find(term => term.officialPriceSlug === normalizedSlug) ?? null;
}
