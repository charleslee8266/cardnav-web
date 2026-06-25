/**
 * 文件说明: 提供中转站首页首屏之后的模型排行 JSON 数据。
 */
import type { APIRoute } from 'astro';
import { publicReadApiCacheControl } from '../../../public-data-cache.js';
import { loadGatewayModels } from '../../../store.js';

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const offset = Math.max(0, Number(url.searchParams.get('offset') || '0') || 0);
  const data = await loadGatewayModels();
  return new Response(JSON.stringify({ offset, items: data.models.slice(offset) }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': publicReadApiCacheControl,
    },
  });
};
