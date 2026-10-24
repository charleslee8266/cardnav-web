/** 文件说明: 组合商品分类约束和商品、商家名搜索结果。 */
import { autoCategoryIdsForFilter } from './models/product-catalog.js';
import { matchesShopSearchQuery, type ShopSearchRow, type ShopSearchQuery, type ShopSearchFieldOptions } from './shop-search-query.js';

/** Category selection is an independent constraint, combined with keyword search. */
export function matchesShopCategory(productCategory: string | undefined, selectedCategory: string): boolean {
  return !selectedCategory || autoCategoryIdsForFilter(selectedCategory).includes(productCategory || 'other');
}

export function searchShopProductRows<Row extends ShopSearchRow>(rows: Row[], query: ShopSearchQuery, options: ShopSearchFieldOptions) {
  const products = rows.filter(row => matchesShopSearchQuery(row, query, { ...options, matchMerchant: false }));
  if (query.mode !== 'advanced' || (products.length > 0 && !options.matchMerchant)) return { products, merchantProducts: [] as Row[] };
  const directMatches = new Set(products);
  const merchantProducts = rows.filter(row => !directMatches.has(row) && matchesShopSearchQuery(row, query, { ...options, matchMerchant: true }));
  return { products, merchantProducts };
}
