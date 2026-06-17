/**
 * 文件说明: 根据数据库里的官方订阅价格元数据构建公开页分组和 URL 解析。
 */
import type { PublicOfficialPriceRow } from './store.js';

export type OfficialPriceGroup<Row extends PublicOfficialPriceRow = PublicOfficialPriceRow> = {
  key: string;
  appSlug: string;
  planSlug: string;
  urlSlug: string;
  pathname: string;
  appName: string;
  planName: string;
  displayName: string;
  isDefault: boolean;
  displayOrder: number;
  prices: Row[];
};

export function officialPricePathname(urlSlug: string) {
  return `/official-price/${urlSlug}`;
}

function isOfficialPriceGroupRow(price: PublicOfficialPriceRow) {
  const urlSlug = price.urlSlug.trim().toLowerCase();
  return Boolean(urlSlug)
    && urlSlug !== 'default'
    && urlSlug !== 'official-price'
    && Boolean(price.displayName.trim());
}

export function resolveOfficialPriceSlug<Group extends OfficialPriceGroup>(slug: string, groups: Group[]) {
  const normalized = slug.trim().toLowerCase();
  return groups.find(group => group.urlSlug === normalized) || null;
}

export function sortOfficialPriceGroups(groups: OfficialPriceGroup[]) {
  return groups.sort((a, b) => {
    const orderDiff = a.displayOrder - b.displayOrder;
    if (orderDiff !== 0) return orderDiff;
    return a.displayName.localeCompare(b.displayName, 'zh-Hans-CN', { numeric: true });
  });
}

export function buildOfficialPriceGroups(rawPrices: PublicOfficialPriceRow[]): OfficialPriceGroup[] {
  const groupMap = new Map<string, OfficialPriceGroup>();

  for (const price of rawPrices) {
    if (!isOfficialPriceGroupRow(price)) continue;

    const key = `${price.appSlug}:${price.planSlug}`;
    const existing = groupMap.get(key);
    if (existing) {
      existing.prices.push(price);
      continue;
    }
    groupMap.set(key, {
      key,
      appSlug: price.appSlug,
      planSlug: price.planSlug,
      urlSlug: price.urlSlug,
      pathname: officialPricePathname(price.urlSlug),
      appName: price.appName,
      planName: price.planName,
      displayName: price.displayName,
      isDefault: price.isDefault,
      displayOrder: price.displayOrder,
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

export function getDefaultOfficialPriceGroup<Group extends OfficialPriceGroup>(groups: Group[]) {
  return groups.find(group => group.isDefault) || groups[0] || null;
}
