/**
 * 文件说明: 在原排序基础上为商家列表分配合作、赞赏和收藏展示名额。
 */
import { MAX_PINNED_PARTNER_SITES, MAX_PINNED_SUPPORT_SITES } from './list-ranking-policy.js';
import { pinListRows } from './list-pinning.js';

export type SitePinRow = {
  sponsor: boolean;
  supportTotalCents: number;
  supportPoints?: number;
  favorite: boolean;
};

export function pinSiteRows<Row extends SitePinRow>(rows: Row[], onPin?: (row: Row, kind: 'partner' | 'support' | 'favorite' | '') => void): Row[] {
  return pinListRows(rows, {
    site: row => row,
    partner: { rows: MAX_PINNED_PARTNER_SITES },
    support: { rows: MAX_PINNED_SUPPORT_SITES },
    favorites: remaining => remaining.filter(row => row.favorite),
    onPin,
  });
}
