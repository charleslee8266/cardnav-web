/**
 * 文件说明: 记录公开商品链接点击，用于商品热度数据回写。
 */
import type { APIRoute } from 'astro';
import { recordProductClick } from '../../store.js';

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({})) as {
    siteId?: unknown;
    productUrl?: unknown;
    categoryName?: unknown;
    name?: unknown;
  };
  const result = await recordProductClick({
    siteId: typeof body.siteId === 'string' ? body.siteId : '',
    productUrl: typeof body.productUrl === 'string' ? body.productUrl : undefined,
    categoryName: typeof body.categoryName === 'string' ? body.categoryName : undefined,
    name: typeof body.name === 'string' ? body.name : undefined,
  });
  return new Response(result.recorded ? JSON.stringify({ ok: true }) : undefined, {
    status: result.recorded ? 202 : 204,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
};

