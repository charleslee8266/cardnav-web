/**
 * 文件说明: 维护卡网商品列表中合作、赞赏积分及收藏商品的展示优先级。
 * 对应文档: docs/specs/public-list-ordering.md
 */
import { pinListRows } from './list-pinning.js';
import {
  MAX_PINNED_FAVORITE_PRODUCTS_PER_SITE,
  MAX_PINNED_FAVORITE_PRODUCTS_TOTAL,
  MAX_PINNED_PARTNER_PRODUCTS,
  MAX_PINNED_PARTNER_PRODUCTS_PER_SITE,
  MAX_PINNED_SUPPORT_PRODUCTS,
  MAX_PINNED_SUPPORT_PRODUCTS_PER_SITE,
} from './list-ranking-policy.js';

export type ShopPinnedRow = {
  productFavoriteKey: string;
  siteFavoriteKey: string;
  sponsor?: boolean;
  supportTotalCents?: number;
  supportPoints?: number;
};

export type ShopPinFavorites = {
  favoriteProductKeys: ReadonlySet<string>;
  favoriteSiteKeys: ReadonlySet<string>;
};

function balancedRowsBySite<Row extends ShopPinnedRow>(
  rowsBySite: Map<string, Row[]>,
  options: { totalLimit: number; siteLimit: number },
) {
  const selectedRows: Row[] = [];
  const selectedCountBySite = new Map<string, number>();
  const totalLimit = options.totalLimit;
  const siteLimit = Math.max(0, options.siteLimit);
  if (totalLimit === 0 || siteLimit === 0) return selectedRows;

  while ((totalLimit === -1 || selectedRows.length < totalLimit) && rowsBySite.size > 0) {
    let didSelect = false;
    for (const [siteKey, rows] of rowsBySite) {
      const selectedForSite = selectedCountBySite.get(siteKey) ?? 0;
      const row = rows.shift();
      if (row && selectedForSite < siteLimit) {
        selectedRows.push(row);
        selectedCountBySite.set(siteKey, selectedForSite + 1);
        didSelect = true;
      }
      if (rows.length === 0 || (selectedCountBySite.get(siteKey) ?? 0) >= siteLimit) {
        rowsBySite.delete(siteKey);
      }
      if (totalLimit !== -1 && selectedRows.length >= totalLimit) break;
    }
    if (!didSelect) break;
  }

  return selectedRows;
}

export function prioritizeShopProductRows<Row extends ShopPinnedRow>(
  rowEntries: Row[],
  favorites: ShopPinFavorites,
  onPin?: (row: Row, kind: 'partner' | 'support' | 'favorite' | '') => void,
) {
  return pinListRows(rowEntries, {
    site: row => ({ id: row.siteFavoriteKey, sponsor: row.sponsor, supportPoints: row.supportPoints }),
    partner: { rows: MAX_PINNED_PARTNER_PRODUCTS, rowsPerSite: MAX_PINNED_PARTNER_PRODUCTS_PER_SITE },
    support: { rows: MAX_PINNED_SUPPORT_PRODUCTS, rowsPerSite: MAX_PINNED_SUPPORT_PRODUCTS_PER_SITE },
    onPin,
    favorites: ordinaryRows => {
      const favoriteProductRows: Row[] = [];
      const favoriteMerchantRowsBySite = new Map<string, Row[]>();
      ordinaryRows.forEach(rowEntry => {
        if (favorites.favoriteProductKeys.has(rowEntry.productFavoriteKey)) {
          favoriteProductRows.push(rowEntry);
        } else if (favorites.favoriteSiteKeys.has(rowEntry.siteFavoriteKey)) {
          const rows = favoriteMerchantRowsBySite.get(rowEntry.siteFavoriteKey) ?? [];
          rows.push(rowEntry);
          favoriteMerchantRowsBySite.set(rowEntry.siteFavoriteKey, rows);
        }
      });

      const favoriteMerchantRows = balancedRowsBySite(favoriteMerchantRowsBySite, {
        totalLimit: MAX_PINNED_FAVORITE_PRODUCTS_TOTAL,
        siteLimit: MAX_PINNED_FAVORITE_PRODUCTS_PER_SITE,
      });
      return [...favoriteProductRows, ...favoriteMerchantRows];
    },
  });
}
