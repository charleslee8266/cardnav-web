/**
 * 文件说明: 维护公开站点由数据库字段派生出的多语言展示名和按语言切换的价格等值展示。
 */
import { getLocaleHtmlLang, type Locale } from './i18n/config.js';
import type { Messages } from './i18n/zh.js';
import type { ModelLeaderboardGroup } from './model-leaderboard.js';
import type { OfficialPriceGroup } from './official-price.js';
import type { PublicModelLeaderboardRow, PublicOfficialPriceRow } from './store.js';

export type LocalizedOfficialPriceRow = PublicOfficialPriceRow & {
  localizedCountryLabel: string;
  equivalentCurrencyCode: string;
  equivalentPriceText: string;
};

export type LocalizedOfficialPriceGroup = OfficialPriceGroup<LocalizedOfficialPriceRow>;

export type LocalizedModelLeaderboardRow = PublicModelLeaderboardRow;

export type LocalizedModelLeaderboardGroup = ModelLeaderboardGroup<LocalizedModelLeaderboardRow>;

type DisplayCurrency = 'CNY' | 'USD' | 'RUB';

const displayCurrencyByLocale: Record<Locale, DisplayCurrency> = {
  zh: 'CNY',
  en: 'USD',
  ru: 'RUB',
};

function formatCurrency(value: number, currency: DisplayCurrency, locale: Locale) {
  return new Intl.NumberFormat(getLocaleHtmlLang(locale), {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'USD' ? 2 : 0,
  }).format(value);
}

function displayCurrencyForLocale(locale: Locale) {
  return displayCurrencyByLocale[locale] ?? 'CNY';
}

function equivalentPriceForCurrency(price: PublicOfficialPriceRow, currency: DisplayCurrency) {
  if (currency === 'USD') return price.usdPrice;
  if (currency === 'RUB') return price.rubPrice;
  return price.cnyPrice;
}

function localizeCountryLabel(countryCode: string, fallback: string, locale: Locale) {
  if (locale === 'zh') return fallback;
  const normalized = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return fallback;
  const displayNames = new Intl.DisplayNames([getLocaleHtmlLang(locale)], { type: 'region' });
  return displayNames.of(normalized) ?? fallback;
}

export function localizeTaskLabel(taskSlug: string, messages: Messages) {
  const taskLabels = messages.leaderboard.taskLabels as Record<string, string>;
  return taskLabels[taskSlug] ?? taskSlug;
}

export function localizeModelLeaderboardGroups(
  groups: ModelLeaderboardGroup[],
  messages: Messages,
): LocalizedModelLeaderboardGroup[] {
  return groups.map(group => {
    const displayName = localizeTaskLabel(group.taskSlug, messages);
    return {
      ...group,
      displayName,
    };
  });
}

export function localizeOfficialPriceGroups(
  groups: OfficialPriceGroup[],
  locale: Locale,
): LocalizedOfficialPriceGroup[] {
  const currency = displayCurrencyForLocale(locale);

  return groups.map(group => ({
    ...group,
    prices: group.prices.map(price => {
      const equivalentPrice = equivalentPriceForCurrency(price, currency);
      return {
        ...price,
        localizedCountryLabel: localizeCountryLabel(price.countryCode, price.countryLabel, locale),
        equivalentCurrencyCode: currency,
        equivalentPriceText: formatCurrency(equivalentPrice, currency, locale),
      };
    }),
  }));
}
