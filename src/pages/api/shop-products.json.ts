/**
 * 文件说明: 提供公开商品页后续加载所需的 shop_sites 与 shop_products 紧凑数据。
 */
import type { APIRoute } from 'astro';
import {
  publicReadApiCacheControl,
  publicReadApiCloudflareCacheControl,
} from '../../public-data-cache.js';
import { packShopProductsData } from '../../shop-products-data.js';
import { loadShopProductsData } from '../../store.js';

export const GET: APIRoute = async ({ url }) => {
  const siteId = url.searchParams.get('siteId')?.trim();
  const payload = packShopProductsData(await loadShopProductsData({ siteId: siteId || undefined }));
  return new Response(JSON.stringify(payload), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': publicReadApiCacheControl,
      'cloudflare-cdn-cache-control': publicReadApiCloudflareCacheControl,
      'cache-tag': 'cardnav-shop-products',
    },
  });
};
