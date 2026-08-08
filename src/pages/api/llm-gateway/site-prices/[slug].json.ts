/**
 * 文件说明: 提供中转站详情页首屏之后的价格明细 JSON 数据。
 */
import type { APIRoute } from 'astro';
import {
  publicReadApiCacheControl,
  publicReadApiCloudflareCacheControl,
} from '../../../../public-data-cache.js';
import { loadGatewayDetail } from '../../../../store.js';

export const GET: APIRoute = async ({ params, request }) => {
  const url = new URL(request.url);
  const offset = Math.max(0, Number(url.searchParams.get('offset') || '0') || 0);
  const detail = await loadGatewayDetail(params.slug || '');

  if (!detail) {
    return new Response(JSON.stringify({ offset, totalCount: 0, items: [] }), {
      status: 404,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': publicReadApiCacheControl,
        'cloudflare-cdn-cache-control': publicReadApiCloudflareCacheControl,
      },
    });
  }

  return new Response(JSON.stringify({
    offset,
    totalCount: detail.site.priceCount,
    items: detail.prices.slice(offset),
  }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': publicReadApiCacheControl,
      'cloudflare-cdn-cache-control': publicReadApiCloudflareCacheControl,
    },
  });
};
