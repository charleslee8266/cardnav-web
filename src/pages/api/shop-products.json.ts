/**
 * 文件说明: 提供公开商品页后续加载所需的 shop_sites 与 shop_products 数据快照。
 */
import type { APIRoute } from 'astro';
import { publicReadApiCacheControl } from '../../public-data-cache.js';
import { loadShopProductsData } from '../../store.js';

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(await loadShopProductsData()), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': publicReadApiCacheControl,
    },
  });
};