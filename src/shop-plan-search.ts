/**
 * 文件说明: 维护卡网商品页快速搜索和可索引预设搜索结果页的计划词真源。
 */
export type QuickPlanSearchTerm = {
  label: string;
  query: string;
  slug: string;
};

export const quickPlanSearchTerms: QuickPlanSearchTerm[] = [
  { label: 'GPT Free', query: 'gpt free|普号|白号', slug: 'gpt-free' },
  // { label: 'GPT Go', query: 'gpt go' },
  { label: 'GPT Plus', query: 'gpt plus -free|普号', slug: 'gpt-plus' },
  { label: 'GPT Pro 5x', query: 'gpt pro 5x', slug: 'gpt-pro-5x' },
  { label: 'GPT Pro 20x', query: 'gpt pro 20x', slug: 'gpt-pro-20x' },

  { label: 'Claude Pro', query: 'claude pro', slug: 'claude-pro' },
  { label: 'Claude Max 5x', query: 'claude 5x', slug: 'claude-max-5x' },
  { label: 'Claude Max 20x', query: 'claude 20x|200', slug: 'claude-max-20x' },

  // { label: 'Gemini AI Plus', query: 'gemini plus' },
  { label: 'Gemini AI Pro', query: 'gemini pro', slug: 'gemini-ai-pro' },
  { label: 'Gemini AI Ultra', query: 'gemini ultra', slug: 'gemini-ai-ultra' },

  // { label: 'Grok SuperGrok Lite', query: 'grok lite' },
  { label: 'SuperGrok', query: 'supergrok', slug: 'supergrok' },
  // { label: 'SuperGrok Heavy', query: 'grok heavy' },
  { label: 'X Premium', query: 'X Premium', slug: 'x-premium' },
  // { label: 'X Premium+', query: 'X Premium+|X Premium Plus' },

  { label: '接码', query: '接码 -free|plus|pay', slug: 'phone-verification' },

  { label: 'Cursor', query: 'cursor', slug: 'cursor' },
  { label: 'Gmail', query: 'gmail -gpt|claude', slug: 'gmail' },
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

export function quickPlanSearchTermForSlug(slug: string | null | undefined) {
  const normalizedSlug = (slug || '').trim().toLowerCase();
  if (!normalizedSlug) return null;
  return quickPlanSearchTerms.find(term => term.slug === normalizedSlug) ?? null;
}
