/**
 * 文件说明: 维护卡网商品列表中收藏和赞助商家商品的展示层置顶规则。
 * 对应文档: docs/specs/shop-sorting-and-score.md
 */
export type ShopPinnedRow = {
  productFavoriteKey: string;
  siteFavoriteKey: string;
  sponsor?: boolean;
};

export type ShopPinFavorites = {
  favoriteProductKeys: ReadonlySet<string>;
  favoriteSiteKeys: ReadonlySet<string>;
};

export type ShopPinOptions = {
  favoriteMerchantProductLimit?: number;
  sponsorProductLimit?: number;
  sponsorProductLimitPerSite?: number;
};

const DEFAULT_FAVORITE_MERCHANT_PRODUCT_LIMIT = 10;
const DEFAULT_SPONSOR_PRODUCT_LIMIT = 10;
const DEFAULT_SPONSOR_PRODUCT_LIMIT_PER_SITE = 5;

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

export function prioritizeShopProductRows<Row extends ShopPinnedRow>(
  rowEntries: Row[],
  favorites: ShopPinFavorites,
  options: ShopPinOptions = {},
) {
  const favoriteMerchantProductLimit = safePositiveInteger(
    options.favoriteMerchantProductLimit,
    DEFAULT_FAVORITE_MERCHANT_PRODUCT_LIMIT,
  );
  const sponsorProductLimit = safePositiveInteger(
    options.sponsorProductLimit,
    DEFAULT_SPONSOR_PRODUCT_LIMIT,
  );
  const sponsorProductLimitPerSite = safePositiveInteger(
    options.sponsorProductLimitPerSite,
    DEFAULT_SPONSOR_PRODUCT_LIMIT_PER_SITE,
  );

  const favoriteProductRows: Row[] = [];
  const favoriteMerchantRowsBySite = new Map<string, Row[]>();
  rowEntries.forEach(rowEntry => {
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

  const sponsorRowsBySite = new Map<string, Row[]>();
  rowEntries.forEach(rowEntry => {
    if (pinnedRows.has(rowEntry) || !rowEntry.sponsor) return;
    const rows = sponsorRowsBySite.get(rowEntry.siteFavoriteKey) ?? [];
    rows.push(rowEntry);
    sponsorRowsBySite.set(rowEntry.siteFavoriteKey, rows);
  });
  const sponsorRows = balancedRowsBySite(sponsorRowsBySite, {
    totalLimit: sponsorProductLimit,
    siteLimit: sponsorProductLimitPerSite,
  });
  sponsorRows.forEach(row => pinnedRows.add(row));

  const regularRows = rowEntries.filter(rowEntry => !pinnedRows.has(rowEntry));
  return [...favoriteProductRows, ...favoriteMerchantRows, ...sponsorRows, ...regularRows];
}
