/**
 * 文件说明: 在原排序基础上为商家列表分配合作、赞赏和收藏展示名额。
 */
import { pinListRows } from './list-pinning.js';

export type SitePinRow = {
  sponsor: boolean;
  supportTotalCents: number;
  supportPoints?: number;
  favorite: boolean;
  defaultIndex?: number;
};

export function pinSiteRows<Row extends SitePinRow>(rows: Row[], onPin?: (row: Row, kind: 'partner' | 'support' | 'favorite' | '') => void, manualSort = false): Row[] {
  return pinListRows(rows, {
    manualSort,
    defaultOrder: (a, b) => (a.defaultIndex ?? 0) - (b.defaultIndex ?? 0),
    site: row => row,
    favorites: remaining => remaining.filter(row => row.favorite),
    onPin,
  });
}
