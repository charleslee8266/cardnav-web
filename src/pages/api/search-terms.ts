/**
 * 文件说明: 记录公开首页搜索词，供热门搜索聚合使用。
 */
import type { APIRoute } from 'astro';
import { recordSearchTerm } from '../../store.js';

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({})) as { term?: unknown; resultCount?: unknown };
  const term = typeof body.term === 'string' ? body.term : '';
  const resultCount = typeof body.resultCount === 'number'
    ? body.resultCount
    : (typeof body.resultCount === 'string' ? Number(body.resultCount) : 0);
  if (!term.trim()) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 400,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  }
  const result = await recordSearchTerm(term, Number.isFinite(resultCount) ? resultCount : 0);
  return new Response(result.recorded ? JSON.stringify({ ok: true }) : undefined, {
    status: result.recorded ? 202 : 204,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
};

