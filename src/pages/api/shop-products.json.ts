/**
 * 文件说明: 提供公开商品页后续加载所需的 shop_sites 与 shop_products 数据快照。
 */
import type { APIRoute } from 'astro';
import {
  publicReadApiCacheControl,
  publicReadApiCloudflareCacheControl,
} from '../../public-data-cache.js';
import { packShopProductsData } from '../../shop-products-data.js';
import { loadPackedShopProductsSnapshot, loadShopProductsData } from '../../store.js';

export const GET: APIRoute = async () => {
  const packedSnapshot = await loadPackedShopProductsSnapshot();
  const payload = packedSnapshot ?? packShopProductsData(await loadShopProductsData());
  return new Response(JSON.stringify(payload), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': publicReadApiCacheControl,
      'cloudflare-cdn-cache-control': publicReadApiCloudflareCacheControl,
      'cache-tag': 'cardnav-shop-products',
    },
  });
};
