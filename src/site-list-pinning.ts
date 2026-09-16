/**
 * 文件说明: 在原排序基础上为商家列表分配合作、赞赏和收藏展示名额。
 */
export type SitePinRow = {
  sponsor: boolean;
  supportTotalCents: number;
  favorite: boolean;
};

export function pinSiteRows<Row extends SitePinRow>(rows: Row[]): Row[] {
  const partners: Row[] = [];
  const supporters: Row[] = [];
  const favorites: Row[] = [];
  const regular: Row[] = [];
  for (const row of rows) {
    if (row.sponsor && partners.length < 10) partners.push(row);
    else if (!row.sponsor && row.supportTotalCents > 0 && supporters.length < 10) supporters.push(row);
    else if (row.favorite) favorites.push(row);
    else regular.push(row);
  }
  return [...partners, ...supporters, ...favorites, ...regular];
}
