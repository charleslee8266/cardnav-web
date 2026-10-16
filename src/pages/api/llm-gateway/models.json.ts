/**
 * 文件说明: 提供中转站首页完整的模型排行 JSON 数据。
 */
import type { APIRoute } from 'astro';
import {
  publicReadApiCacheControl,
  publicReadApiCloudflareCacheControl,
} from '../../../public-data-cache.js';
import { loadGatewayModels } from '../../../store.js';

export const GET: APIRoute = async () => {
  const data = await loadGatewayModels();
  return new Response(JSON.stringify({ totalCount: data.models.length, items: data.models }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': publicReadApiCacheControl,
      'cloudflare-cdn-cache-control': publicReadApiCloudflareCacheControl,
    },
  });
};
