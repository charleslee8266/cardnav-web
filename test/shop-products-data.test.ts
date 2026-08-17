/**
 * 文件说明: 验证商品页 packed 数据契约压缩重复字段，并保持前端读取行为稳定。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  packShopProductsData,
  shopProductCategoryName,
  shopProductInStock,
  shopProductName,
  shopProductPriceUnit,
  shopProductRefreshTime,
  shopProductSite,
  shopProducts,
  shopProductsTotalInStockProductCount,
  shopSiteName,
  shopSiteSponsor,
  shopSites,
} from '../src/shop-products-data.js';
import type { PublicShopProductsData } from '../src/shop-products-data.js';

const fixture: PublicShopProductsData = {
  sites: [{
    id: 'merchant-a',
    name: '商家 A',
    url: 'https://example.com',
    lastProductRefreshSuccessAt: '2026-07-31T12:00:00.000Z',
    lastProductRefreshSuccessTime: '2026-07-31 20:00:00',
    score: 9.5,
    sponsor: true,
  }],
  products: [
    {
      siteId: 'merchant-a',
      siteName: '商家 A',
      siteUrl: 'https://example.com',
      siteProductRefreshSuccessAt: '2026-07-31T12:00:00.000Z',
      siteProductRefreshSuccessTime: '2026-07-31 20:00:00',
      siteScore: 9.5,
      siteSponsor: true,
      categoryName: 'ChatGPT',
      name: 'Plus 成品号',
      price: '¥35',
      priceNumber: 35,
      priceUnit: '¥',
      productUrl: 'https://example.com/item/plus',
      stock: 12,
      inStock: true,
      refreshedAt: '2026-07-31T12:30:00.000Z',
      refreshTime: '2026-07-31 20:30:00',
      clickCount: 3,
      score: 8.25,
    },
    {
      siteId: 'merchant-a',
      siteName: '商家 A',
      siteUrl: 'https://example.com',
      siteProductRefreshSuccessAt: '2026-07-31T12:00:00.000Z',
      siteProductRefreshSuccessTime: '2026-07-31 20:00:00',
      siteScore: 9.5,
      siteSponsor: true,
      categoryName: 'ChatGPT',
      name: 'API 额度',
      price: '$5',
      priceNumber: 5,
      priceUnit: '$',
      productUrl: '',
      inStock: false,
      refreshedAt: '2026-07-31T13:00:00.000Z',
      refreshTime: '2026-07-31 21:00:00',
      clickCount: 0,
      score: 6,
    },
  ],
  totalSiteCount: 1,
  totalProductCount: 2,
  totalInStockProductCount: 1,
  latestRefreshedAt: '2026-07-31T13:00:00.000Z',
  latestRefreshTime: '2026-07-31 21:00:00',
  initialProductLimit: 40,
  isPartial: true,
};

test('packed shop products share site, category and default CNY unit data', () => {
  const packed = packShopProductsData(fixture);
  const products = shopProducts(packed);

  assert.equal(shopSites(packed).length, 1);
  assert.deepEqual(packed.c, ['ChatGPT']);
  assert.deepEqual(packed.u, ['$']);
  assert.equal(products[0][4], null);
  assert.equal(products[1][4], 0);
  assert.equal(JSON.stringify(packed).includes('siteName'), false);
  assert.equal(shopProductsTotalInStockProductCount(packed), 1);
});

test('packed shop products accessors read page fields without unpacking long objects', () => {
  const packed = packShopProductsData(fixture);
  const [first, second] = shopProducts(packed);

  assert.equal(shopSiteName(shopProductSite(packed, first)), '商家 A');
  assert.equal(shopSiteSponsor(shopProductSite(packed, first)), true);
  assert.equal(shopProductCategoryName(packed, first), 'ChatGPT');
  assert.equal(shopProductName(first), 'Plus 成品号');
  assert.equal(shopProductPriceUnit(packed, first), '¥');
  assert.equal(shopProductPriceUnit(packed, second), '$');
  assert.equal(shopProductInStock(second), false);
  assert.equal(shopProductRefreshTime(first), '2026-07-31 20:30:00');
});
