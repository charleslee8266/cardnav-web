/**
 * 文件说明: 在原排序基础上为商家列表分配合作、赞赏和收藏展示名额。
 */
import { MAX_PINNED_PARTNER_SITES, MAX_PINNED_SUPPORT_SITES } from './list-ranking-policy.js';

export type SitePinRow = {
  sponsor: boolean;
  supportTotalCents: number;
  supportPoints?: number;
  favorite: boolean;
};

export function pinSiteRows<Row extends SitePinRow>(rows: Row[]): Row[] {
  const bySupportPoints = (left: Row, right: Row) => (right.supportPoints ?? 0) - (left.supportPoints ?? 0);
  const partners = rows.filter(row => row.sponsor).sort(bySupportPoints).slice(0, MAX_PINNED_PARTNER_SITES);
  const supporters = rows.filter(row => !row.sponsor && (row.supportPoints ?? 0) > 0)
    .sort(bySupportPoints).slice(0, MAX_PINNED_SUPPORT_SITES);
  const pinned = new Set([...partners, ...supporters]);
  const favorites: Row[] = [];
  const regular: Row[] = [];
  for (const row of rows) {
    if (pinned.has(row)) continue;
    if (row.favorite) favorites.push(row);
    else regular.push(row);
  }
  return [...partners, ...supporters, ...favorites, ...regular];
}
