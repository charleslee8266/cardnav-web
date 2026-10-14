/**
 * 文件说明: 接收商品曝光和点击，按匿名访客写入去重的每日行为统计。
 */
import type { APIRoute } from 'astro';
import { recordProductMetrics, type ProductMetricInput } from '../../store.js';

import { readMetricEvents } from '../../metric-request.js';

const eventTypes = new Set(['impression', 'click']);
const scenes = new Set(['default', 'search']);
const displayTypes = new Set(['normal', 'partner', 'support', 'favorite']);
const positionBuckets = new Set(['1-5', '6-20', '21+']);

export const POST: APIRoute = async ({ request }) => {
  const events = await readMetricEvents(request);
  if (!events || events.some(body => typeof body.productId !== 'string' || typeof body.visitorId !== 'string'
    || !eventTypes.has(String(body.eventType)) || !scenes.has(String(body.scene))
    || !displayTypes.has(String(body.displayType)) || !positionBuckets.has(String(body.positionBucket)))) {
    return new Response(null, { status: 400 });
  }
  const result = await recordProductMetrics(events as ProductMetricInput[]);
  return new Response(null, {
    status: result.recorded ? 202 : 204,
    headers: { 'cache-control': 'no-store' },
  });
};
