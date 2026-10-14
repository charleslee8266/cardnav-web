import { readMetricEvents } from '../../metric-request.js';
/**
 * 文件说明: 记录公开商品链接点击，用于商品热度数据回写。
 */
import type { APIRoute } from 'astro';
import { recordProductClick, recordMerchantProductClicks } from '../../store.js';

export const POST: APIRoute = async ({ request }) => {
  const events = await readMetricEvents(request, 'productId');
  if (!events) return new Response(null, { status: 400 });
  const direct = events.filter(body => typeof body.productId === 'string');
  if (direct.some(body => typeof body.visitorId !== 'string')) return new Response(null, { status: 400 });
  let recorded = direct.length ? (await recordMerchantProductClicks(direct as { productId: string; visitorId: string }[])).recorded : false;
  // Cached clients still identify merchant products by URL or name.
  for (const body of events.filter(body => !('productId' in body))) {
    const result = await recordProductClick({
      siteId: typeof body.siteId === 'string' ? body.siteId : '',
      productUrl: typeof body.productUrl === 'string' ? body.productUrl : undefined,
      categoryName: typeof body.categoryName === 'string' ? body.categoryName : undefined,
      name: typeof body.name === 'string' ? body.name : undefined,
      visitorId: typeof body.visitorId === 'string' ? body.visitorId : '',
    });
    recorded ||= result.recorded;
  }
  return new Response(recorded ? JSON.stringify({ ok: true }) : undefined, {
    status: recorded ? 202 : 204,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
};
