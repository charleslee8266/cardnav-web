/**
 * 文件说明: 提供公开首页热门搜索词列表。
 */
import type { APIRoute } from 'astro';
import { publicReadApiCacheControl } from '../../../public-data-cache.js';
import { loadPopularSearchTerms } from '../../../store.js';

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get('limit') || '10');
  const snapshot = await loadPopularSearchTerms(Number.isFinite(limit) ? limit : 10);
  return new Response(JSON.stringify({ terms: snapshot.terms }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': publicReadApiCacheControl,
    },
  });
};

