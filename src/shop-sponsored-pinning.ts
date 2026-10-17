/**
 * 文件说明: 维护卡网商品列表中合作、赞赏积分及收藏商品的展示优先级。
 * 对应文档: docs/specs/public-list-ordering.md
 */
import { pinListRows } from './list-pinning.js';
import { MAX_PINNED_FAVORITE_PRODUCTS_PER_SITE } from './list-ranking-policy.js';

export type ShopPinnedRow = {
  id: string;
  productFavoriteKey: string;
  score: number;
  siteFavoriteKey: string;
  sponsor?: boolean;
  supportTotalCents?: number;
  supportPoints?: number;
};

export type ShopPinFavorites = {
  favoriteProductKeys: ReadonlySet<string>;
  favoriteSiteKeys: ReadonlySet<string>;
};

export function compareShopProductRows(a: ShopPinnedRow, b: ShopPinnedRow) {
  return b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function prioritizeShopProductRows<Row extends ShopPinnedRow>(
  rowEntries: Row[],
  favorites: ShopPinFavorites,
  onPin?: (row: Row, kind: 'partner' | 'support' | 'favorite' | '') => void,
  manualSort = false,
  options: { pinMerchants?: boolean } = {},
) {
  const pinMerchants = options.pinMerchants !== false;
  return pinListRows(rowEntries, {
    manualSort,
    defaultOrder: compareShopProductRows,
    site: row => ({ id: row.siteFavoriteKey, sponsor: pinMerchants && row.sponsor, supportPoints: pinMerchants ? row.supportPoints : 0 }),
    onPin,
    favorites: ordinaryRows => {
      if (!favorites.favoriteSiteKeys.size && !favorites.favoriteProductKeys.size) return [];
      const selectedCountBySite = new Map<string, number>();
      return ordinaryRows.filter(row => (pinMerchants && favorites.favoriteSiteKeys.has(row.siteFavoriteKey))
        || favorites.favoriteProductKeys.has(row.productFavoriteKey)).sort(compareShopProductRows).filter(row => {
        let merchantSelected = false;
        if (pinMerchants && favorites.favoriteSiteKeys.has(row.siteFavoriteKey)) {
          const count = selectedCountBySite.get(row.siteFavoriteKey) ?? 0;
          merchantSelected = count < MAX_PINNED_FAVORITE_PRODUCTS_PER_SITE;
          if (merchantSelected) selectedCountBySite.set(row.siteFavoriteKey, count + 1);
        }
        return merchantSelected || favorites.favoriteProductKeys.has(row.productFavoriteKey);
      });
    },
  });
}
