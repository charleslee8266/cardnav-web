/**
 * 文件说明: 提供中转站首页完整的站点排行 JSON 数据。
 */
import type { APIRoute } from 'astro';
import {
  publicReadApiCacheControl,
  publicReadApiCloudflareCacheControl,
} from '../../../public-data-cache.js';
import { loadGatewaySites } from '../../../store.js';

export const GET: APIRoute = async () => {
  const data = await loadGatewaySites();
  return new Response(JSON.stringify({ totalCount: data.sites.length, items: data.sites }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': publicReadApiCacheControl,
      'cloudflare-cdn-cache-control': publicReadApiCloudflareCacheControl,
    },
  });
};
