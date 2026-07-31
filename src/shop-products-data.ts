/**
 * 文件说明: 定义商品页公开数据的紧凑传输结构，并提供打包与字段读取函数。
 */
import type { PublicProductRow, PublicSiteRow } from './store.js';

const PACKED_SHOP_PRODUCTS_VERSION = 1;
const DEFAULT_PRICE_UNIT = '¥';
const NO_PRICE_UNIT = -1;

export type PublicShopProductsData = {
  sites: PublicSiteRow[];
  products: PublicProductRow[];
  totalSiteCount: number;
  totalProductCount: number;
  latestRefreshedAt?: string | null;
  latestRefreshTime: string;
  initialProductLimit?: number;
  isPartial: boolean;
};

export type PackedShopSiteRow = [
  id: string,
  name: string,
  url: string,
  lastProductRefreshSuccessMs: number | null,
  score: number,
];

export type PackedShopProductRow = [
  siteIndex: number,
  categoryIndex: number,
  name: string,
  priceNumber: number | null,
  priceUnitIndex: number | null,
  productUrl: string,
  stock: number | null,
  inStock: 0 | 1,
  refreshedMs: number | null,
  score: number,
];

export type PackedShopProductsData = {
  v: 1;
  s: PackedShopSiteRow[];
  c: string[];
  u: string[];
  p: PackedShopProductRow[];
  sc: number;
  pc: number;
  l: number | null;
  i?: number;
  x: 0 | 1;
};

const beijingDateFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function timestampMs(input: string | null | undefined) {
  if (!input) return null;
  const value = new Date(input).getTime();
  return Number.isFinite(value) ? value : null;
}

function formatBeijingTime(input: number | null | undefined) {
  if (!input) return '';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  const parts = beijingDateFormatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day} ${lookup.hour}:${lookup.minute}:${lookup.second}`;
}

function normalizePriceUnit(unit: string | null | undefined) {
  const value = String(unit ?? '').trim();
  if (!value) return '';
  if (value === '￥' || value === '元' || value.toLowerCase() === 'cny' || value.toLowerCase() === 'rmb') {
    return DEFAULT_PRICE_UNIT;
  }
  return value;
}

function priceUnitToken(unit: string | null | undefined, units: string[]) {
  const normalizedUnit = normalizePriceUnit(unit);
  if (!normalizedUnit) return NO_PRICE_UNIT;
  if (normalizedUnit === DEFAULT_PRICE_UNIT) return null;
  const existingIndex = units.indexOf(normalizedUnit);
  if (existingIndex >= 0) return existingIndex;
  units.push(normalizedUnit);
  return units.length - 1;
}

function categoryToken(categoryName: string, categories: string[]) {
  const existingIndex = categories.indexOf(categoryName);
  if (existingIndex >= 0) return existingIndex;
  categories.push(categoryName);
  return categories.length - 1;
}

export function packShopProductsData(data: PublicShopProductsData): PackedShopProductsData {
  const siteIndexById = new Map<string, number>();
  const sites: PackedShopSiteRow[] = data.sites.map((site, index) => {
    siteIndexById.set(site.id, index);
    return [
      site.id,
      site.name,
      site.url,
      timestampMs(site.lastProductRefreshSuccessAt),
      Number(site.score) || 0,
    ];
  });
  const categories: string[] = [];
  const units: string[] = [];
  const products: PackedShopProductRow[] = data.products.map(product => {
    let siteIndex = siteIndexById.get(product.siteId);
    if (siteIndex === undefined) {
      siteIndex = sites.length;
      siteIndexById.set(product.siteId, siteIndex);
      sites.push([
        product.siteId,
        product.siteName,
        product.siteUrl,
        timestampMs(product.siteProductRefreshSuccessAt),
        Number(product.siteScore) || 0,
      ]);
    }
    return [
      siteIndex,
      categoryToken(product.categoryName, categories),
      product.name,
      typeof product.priceNumber === 'number' ? product.priceNumber : null,
      priceUnitToken(product.priceUnit, units),
      product.productUrl || '',
      typeof product.stock === 'number' ? product.stock : null,
      product.inStock ? 1 : 0,
      timestampMs(product.refreshedAt),
      Number(product.score) || 0,
    ];
  });

  return {
    v: PACKED_SHOP_PRODUCTS_VERSION,
    s: sites,
    c: categories,
    u: units,
    p: products,
    sc: data.totalSiteCount,
    pc: data.totalProductCount,
    l: timestampMs(data.latestRefreshedAt),
    ...(typeof data.initialProductLimit === 'number' ? { i: data.initialProductLimit } : {}),
    x: data.isPartial ? 1 : 0,
  };
}

export function shopProducts(data: PackedShopProductsData) {
  return Array.isArray(data.p) ? data.p : [];
}

export function shopSites(data: PackedShopProductsData) {
  return Array.isArray(data.s) ? data.s : [];
}

export function shopProductsIsPartial(data: PackedShopProductsData) {
  return data.x === 1;
}

export function shopProductsInitialLimit(data: PackedShopProductsData) {
  return Number(data.i) > 0 ? Number(data.i) : 0;
}

export function shopProductsTotalProductCount(data: PackedShopProductsData) {
  return Number(data.pc) || shopProducts(data).length;
}

export function shopProductSite(data: PackedShopProductsData, product: PackedShopProductRow) {
  return shopSites(data)[product[0]] || null;
}

export function shopSiteId(site: PackedShopSiteRow | null | undefined) {
  return site?.[0] || '';
}

export function shopSiteName(site: PackedShopSiteRow | null | undefined) {
  return site?.[1] || '';
}

export function shopSiteUrl(site: PackedShopSiteRow | null | undefined) {
  return site?.[2] || '';
}

export function shopSiteLastRefreshMs(site: PackedShopSiteRow | null | undefined) {
  return typeof site?.[3] === 'number' ? site[3] : null;
}

export function shopSiteLastRefreshTime(site: PackedShopSiteRow | null | undefined) {
  return formatBeijingTime(shopSiteLastRefreshMs(site));
}

export function shopSiteScore(site: PackedShopSiteRow | null | undefined) {
  return Number(site?.[4]) || 0;
}

export function shopProductCategoryName(data: PackedShopProductsData, product: PackedShopProductRow) {
  return data.c?.[product[1]] || '';
}

export function shopProductName(product: PackedShopProductRow) {
  return product[2] || '';
}

export function shopProductPriceNumber(product: PackedShopProductRow) {
  return typeof product[3] === 'number' ? product[3] : null;
}

export function shopProductPriceUnit(data: PackedShopProductsData, product: PackedShopProductRow) {
  const token = product[4];
  if (token === null) return DEFAULT_PRICE_UNIT;
  if (token === NO_PRICE_UNIT) return null;
  return typeof token === 'number' ? data.u?.[token] || null : null;
}

export function shopProductUrl(product: PackedShopProductRow) {
  return product[5] || '';
}

export function shopProductStock(product: PackedShopProductRow) {
  return typeof product[6] === 'number' ? product[6] : null;
}

export function shopProductInStock(product: PackedShopProductRow) {
  return product[7] === 1;
}

export function shopProductRefreshedMs(product: PackedShopProductRow) {
  return typeof product[8] === 'number' ? product[8] : null;
}

export function shopProductRefreshTime(product: PackedShopProductRow) {
  return formatBeijingTime(shopProductRefreshedMs(product));
}

export function shopProductScore(product: PackedShopProductRow) {
  return Number(product[9]) || 0;
}
