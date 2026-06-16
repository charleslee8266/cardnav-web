/**
 * 文件说明: 维护官方订阅比价页的套餐标签、排序、URL slug 和分组构建规则。
 */
import type { PublicOfficialPriceRow } from './store.js';

export const officialPriceAppLabels: Record<string, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  grok: 'Grok',
  copilot: 'Copilot',
  kimi: 'Kimi',
  x: 'X',
};

export const officialPriceAppOrder = ['chatgpt', 'claude', 'gemini', 'grok', 'copilot', 'kimi', 'x'];

export const officialPricePlanLabels: Record<string, string> = {
  'go-monthly': 'Go',
  plus: 'Plus',
  'pro-5x': 'Pro 5x',
  'pro-20x': 'Pro 20x',
  pro: 'Pro',
  'max-5x-monthly': 'Max 5x',
  'max-20x-monthly': 'Max 20x',
  'ai-plus': 'AI Plus',
  advanced: 'AI Pro',
  'ai-ultra': 'AI Ultra',
  'supergrok-lite': 'SuperGrok Lite',
  supergrok: 'SuperGrok',
  'supergrok-heavy': 'SuperGrok Heavy',
  moderato: 'Moderato',
  allegretto: 'Allegretto',
  basic: 'Basic',
  premium: 'Premium',
  'premium-plus': 'Premium+',
};

export const officialPricePlanOrder: Record<string, string[]> = {
  chatgpt: ['go-monthly', 'plus', 'pro-5x', 'pro-20x'],
  claude: ['pro', 'max-5x-monthly', 'max-20x-monthly'],
  gemini: ['ai-plus', 'advanced', 'ai-ultra'],
  grok: ['supergrok-lite', 'supergrok', 'supergrok-heavy'],
  copilot: ['pro'],
  kimi: ['moderato', 'allegretto'],
  x: ['basic', 'premium', 'premium-plus'],
};

const publicPlanSlugAliases: Record<string, string> = {
  'go-monthly': 'go',
  'max-5x-monthly': 'max-5x',
  'max-20x-monthly': 'max-20x',
};

const canonicalPlanSlugByAlias = Object.fromEntries(
  Object.entries(publicPlanSlugAliases).map(([planSlug, publicSlug]) => [publicSlug, planSlug]),
);

export type OfficialPriceGroup = {
  key: string;
  appSlug: string;
  planSlug: string;
  urlSlug: string;
  pathname: string;
  appName: string;
  planName: string;
  displayName: string;
  prices: PublicOfficialPriceRow[];
};

export function labelFromSlug(slug: string) {
  return slug
    .split('-')
    .filter(Boolean)
    .map(part => part.length <= 3 ? part.toUpperCase() : `${part[0]?.toUpperCase() || ''}${part.slice(1)}`)
    .join(' ');
}

export function officialPriceAppLabel(appSlug: string) {
  return officialPriceAppLabels[appSlug] || labelFromSlug(appSlug);
}

export function officialPricePlanLabel(planSlug: string) {
  return officialPricePlanLabels[planSlug] || labelFromSlug(planSlug);
}

export function officialPriceUrlSlug(appSlug: string, planSlug: string) {
  return `${appSlug}-${publicPlanSlugAliases[planSlug] || planSlug}`;
}

export function officialPricePathname(appSlug: string, planSlug: string) {
  return `/official-price/${officialPriceUrlSlug(appSlug, planSlug)}`;
}

export function resolveOfficialPriceSlug(slug: string) {
  const normalized = slug.trim().toLowerCase();
  for (const appSlug of officialPriceAppOrder) {
    const prefix = `${appSlug}-`;
    if (!normalized.startsWith(prefix)) continue;
    const publicPlanSlug = normalized.slice(prefix.length);
    const planSlug = canonicalPlanSlugByAlias[publicPlanSlug] || publicPlanSlug;
    return { appSlug, planSlug };
  }
  return null;
}

function orderedIndex(values: string[], value: string) {
  const index = values.indexOf(value);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export function sortOfficialPriceGroups(groups: OfficialPriceGroup[]) {
  return groups.sort((a, b) => {
    const appDiff = orderedIndex(officialPriceAppOrder, a.appSlug) - orderedIndex(officialPriceAppOrder, b.appSlug);
    if (appDiff !== 0) return appDiff;

    const planDiff = orderedIndex(officialPricePlanOrder[a.appSlug] || [], a.planSlug) - orderedIndex(officialPricePlanOrder[b.appSlug] || [], b.planSlug);
    if (planDiff !== 0) return planDiff;

    return a.displayName.localeCompare(b.displayName, 'zh-Hans-CN', { numeric: true });
  });
}

export function buildOfficialPriceGroups(rawPrices: PublicOfficialPriceRow[]): OfficialPriceGroup[] {
  const groupMap = new Map<string, OfficialPriceGroup>();

  for (const price of rawPrices) {
    const key = `${price.appSlug}:${price.planSlug}`;
    const existing = groupMap.get(key);
    if (existing) {
      existing.prices.push(price);
      continue;
    }
    const appName = officialPriceAppLabel(price.appSlug);
    const planName = officialPricePlanLabel(price.planSlug);
    groupMap.set(key, {
      key,
      appSlug: price.appSlug,
      planSlug: price.planSlug,
      urlSlug: officialPriceUrlSlug(price.appSlug, price.planSlug),
      pathname: officialPricePathname(price.appSlug, price.planSlug),
      appName,
      planName,
      displayName: `${appName} ${planName}`,
      prices: [price],
    });
  }

  return sortOfficialPriceGroups(
    Array.from(groupMap.values()).map(group => ({
      ...group,
      prices: group.prices.sort((a, b) => a.cnyPrice - b.cnyPrice),
    })),
  );
}

export function getOfficialPriceKnownGroups(): OfficialPriceGroup[] {
  return sortOfficialPriceGroups(
    officialPriceAppOrder.flatMap(appSlug => (officialPricePlanOrder[appSlug] || []).map(planSlug => {
      const appName = officialPriceAppLabel(appSlug);
      const planName = officialPricePlanLabel(planSlug);
      return {
        key: `${appSlug}:${planSlug}`,
        appSlug,
        planSlug,
        urlSlug: officialPriceUrlSlug(appSlug, planSlug),
        pathname: officialPricePathname(appSlug, planSlug),
        appName,
        planName,
        displayName: `${appName} ${planName}`,
        prices: [],
      };
    })),
  );
}
