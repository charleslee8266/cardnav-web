/**
 * 文件说明: 维护卡网商品列表中合作、累计赞赏及收藏商品的展示优先级。
 * 对应文档: docs/specs/shop-sorting-and-score.md
 */
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

export type ShopPinOptions = {
  favoriteMerchantProductLimit?: number;
};

const DEFAULT_FAVORITE_MERCHANT_PRODUCT_LIMIT = 10;
const MERCHANT_GROUP_PRODUCT_LIMIT = 10;
const SPONSOR_PRODUCT_LIMIT_PER_SITE = 2;
const SUPPORT_PRODUCT_LIMIT_PER_SITE = 2;

function safePositiveInteger(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback;
}

function balancedRowsBySite<Row extends ShopPinnedRow>(
  rowsBySite: Map<string, Row[]>,
  options: { totalLimit: number; siteLimit: number },
) {
  const selectedRows: Row[] = [];
  const selectedCountBySite = new Map<string, number>();
  const totalLimit = Math.max(0, options.totalLimit);
  const siteLimit = Math.max(0, options.siteLimit);
  if (totalLimit === 0 || siteLimit === 0) return selectedRows;

  while (selectedRows.length < totalLimit && rowsBySite.size > 0) {
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
      if (selectedRows.length >= totalLimit) break;
    }
    if (!didSelect) break;
  }

  return selectedRows;
}

function limitedMerchantRows<Row extends ShopPinnedRow>(rows: Row[], siteLimit: number) {
  const counts = new Map<string, number>();
  const selectedRows: Row[] = [];
  for (const row of rows) {
    if (selectedRows.length >= MERCHANT_GROUP_PRODUCT_LIMIT) break;
    const count = counts.get(row.siteFavoriteKey) ?? 0;
    if (count >= siteLimit) continue;
    selectedRows.push(row);
    counts.set(row.siteFavoriteKey, count + 1);
  }
  return selectedRows;
}

export function prioritizeShopProductRows<Row extends ShopPinnedRow>(
  rowEntries: Row[],
  favorites: ShopPinFavorites,
  options: ShopPinOptions = {},
) {
  const favoriteMerchantProductLimit = safePositiveInteger(
    options.favoriteMerchantProductLimit,
    DEFAULT_FAVORITE_MERCHANT_PRODUCT_LIMIT,
  );
  const sponsorRows = limitedMerchantRows(rowEntries.filter(row => row.sponsor), SPONSOR_PRODUCT_LIMIT_PER_SITE);
  const supportRows = limitedMerchantRows(rowEntries.filter(row => !row.sponsor && (row.supportPoints ?? row.supportTotalCents ?? 0) > 0), SUPPORT_PRODUCT_LIMIT_PER_SITE);
  const merchantPinnedRows = new Set<Row>([...sponsorRows, ...supportRows]);
  const ordinaryRows = rowEntries.filter(row => !merchantPinnedRows.has(row));

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

  const pinnedRows = new Set<Row>(favoriteProductRows);
  const favoriteMerchantRows = balancedRowsBySite(favoriteMerchantRowsBySite, {
    totalLimit: favoriteMerchantProductLimit,
    siteLimit: favoriteMerchantProductLimit,
  });
  favoriteMerchantRows.forEach(row => pinnedRows.add(row));

  const regularRows = ordinaryRows.filter(rowEntry => !pinnedRows.has(rowEntry));
  return [...sponsorRows, ...supportRows, ...favoriteProductRows, ...favoriteMerchantRows, ...regularRows];
}
