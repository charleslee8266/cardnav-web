/**
 * 文件说明: 接收有界的合作商家点击批次，拒绝跨站请求与不合法事件。
 */
import type { APIRoute } from 'astro';
import { readMetricEvents } from '../../metric-request.js';
import { parseSponsorClick, type SponsorClickEvent } from '../../sponsor-click.js';
import { SponsorClickStore } from '../../SponsorClickStore.js';
const store = new SponsorClickStore();
export const POST: APIRoute = async ({ request }) => {
  const origin = request.headers.get('origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== new URL(request.url).origin)) {
    return new Response(null, { status: 403 });
  }
  const bodies = await readMetricEvents(request);
  if (!bodies) return new Response(null, { status: 400 });
  const events = bodies.map(parseSponsorClick);
  if (events.some(event => !event)) return new Response(null, { status: 400 });
  const result = await store.record(events as SponsorClickEvent[]);
  return new Response(null, { status: result.recorded ? 202 : 204, headers: { 'cache-control': 'no-store' } });
};
