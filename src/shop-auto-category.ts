/** 文件说明: 维护商品自动分类的公开标识与展示名称。 */
import { autoCategoryLabels } from './i18n/auto-categories.js';
import { isLocale } from './i18n/config.js';

/** 商品自动分类的公开标识与展示名称。 */
export const autoCategories: readonly { id: string; label: string }[] = [
  { id: 'gpt-pro-100', label: 'GPT Pro 100' },
  { id: 'gpt-pro-200', label: 'GPT Pro 200' },
  { id: 'gpt-pro-500', label: 'GPT Pro 500' },
  { id: 'gpt-pro', label: 'GPT Pro' },
  { id: 'gpt-team', label: 'GPT Team' },
  { id: 'gpt-team-5x', label: 'GPT Team 5x' },
  { id: 'gpt-plus', label: 'GPT Plus' },
  { id: 'gpt-go', label: 'GPT Go' },
  { id: 'gpt-free', label: 'GPT Free' },
  { id: 'gpt', label: 'GPT' },
  { id: 'claude-max-5x', label: 'Claude Max 5x' },
  { id: 'claude-max-20x', label: 'Claude Max 20x' },
  { id: 'claude-max', label: 'Claude Max' },
  { id: 'claude-team', label: 'Claude Team' },
  { id: 'claude-pro', label: 'Claude Pro' },
  { id: 'claude-free', label: 'Claude Free' },
  { id: 'claude', label: 'Claude' },
  { id: 'gemini-ultra-5x', label: 'Gemini Ultra 5x' },
  { id: 'gemini-ultra-20x', label: 'Gemini Ultra 20x' },
  { id: 'gemini-pro', label: 'Gemini Pro' },
  { id: 'gemini-plus', label: 'Gemini Plus' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'grok-free', label: 'Grok Free' },
  { id: 'grok-plus', label: 'Grok Plus' },
  { id: 'grok-premium', label: 'Grok Premium' },
  { id: 'grok-super', label: 'Grok Super' },
  { id: 'grok-ultra', label: 'Grok Ultra' },
  { id: 'supergrok-lite', label: 'SuperGrok Lite' },
  { id: 'muse', label: 'Muse' },
  { id: 'supergrok-heavy', label: 'SuperGrok Heavy' },
  { id: 'supergrok-plus', label: 'SuperGrok Plus' },
  { id: 'supergrok', label: 'SuperGrok' },
  { id: 'grok', label: 'Grok' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'kiro', label: 'Kiro' },
  { id: 'windsurf', label: 'Windsurf' },
  { id: 'perplexity', label: 'Perplexity' },
  { id: 'midjourney', label: 'Midjourney' },
  { id: 'sora', label: 'Sora' },
  { id: 'suno', label: 'Suno' },
  { id: 'x-premium-plus', label: 'X Premium+' },
  { id: 'x-premium', label: 'X Premium' },
  { id: 'x-free', label: 'X Free' },
  { id: 'x', label: 'X' },
  { id: 'gmail', label: 'Gmail' },
  { id: 'outlook', label: 'Outlook' },
  { id: 'vcc', label: '虚拟卡' },
  { id: 'icloud', label: 'iCloud 邮箱' },
  { id: 'apple-id', label: 'Apple ID' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'paypal', label: 'PayPal' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'api-gateway', label: '中转站' },
  { id: 'kyc', label: 'KYC' },
  { id: 'phone-verification', label: '接码' },
  { id: 'canva', label: 'Canva' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'seedance', label: 'Seedance / 即梦' },
  { id: 'copilot', label: 'Copilot' },
  { id: 'kimi', label: 'Kimi' },
  { id: 'minimax', label: 'MiniMax' },
  { id: 'netflix', label: 'Netflix' },
  { id: 'spotify', label: 'Spotify' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'notion', label: 'Notion' },
  { id: 'other', label: '其他' },
];

const categoriesById = new Map(autoCategories.map(category => [category.id, category]));

export function autoCategoryLabel(id: string, language = 'zh'): string {
  const category = categoriesById.get(id) ?? categoriesById.get('other')!;
  const locale = language.toLowerCase().split('-')[0];
  const translations = isLocale(locale) ? autoCategoryLabels[locale] : undefined;
  return translations?.[category.id] ?? category.label;
}
