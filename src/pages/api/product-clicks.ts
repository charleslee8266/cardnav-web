/**
 * 文件说明: 校验并记录商品与商家外跳明细，同时回写商品每日去重点击。
 */
import type { APIRoute } from 'astro';
import { readMetricEvents } from '../../metric-request.js';
import { parseShopClick, type ShopClickEvent } from '../../shop-click.js';
import { recordProductClick, recordMerchantProductClicks, recordShopClicks } from '../../store.js';

export const POST: APIRoute = async ({ request }) => {
  const events = await readMetricEvents(request, 'productId');
  if (!events) return new Response(null, { status: 400 });
  const detailBodies = events.filter(body => 'eventId' in body);
  const details = detailBodies.map(parseShopClick);
  if (details.some(event => !event)) return new Response(null, { status: 400 });
  const legacy = events.filter(body => !('eventId' in body));
  const direct = legacy.filter(body => typeof body.productId === 'string');
  if (direct.some(body => typeof body.visitorId !== 'string')) return new Response(null, { status: 400 });
  let recorded = details.length ? (await recordShopClicks(details as ShopClickEvent[])).recorded : false;
  recorded = (direct.length ? (await recordMerchantProductClicks(direct as { productId: string; visitorId: string }[])).recorded : false) || recorded;
  // Cached clients still identify merchant products by URL or name.
  for (const body of legacy.filter(body => !('productId' in body))) {
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
