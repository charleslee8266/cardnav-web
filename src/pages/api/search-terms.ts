import { readMetricEvents } from '../../metric-request.js';
/**
 * 文件说明: 记录公开首页搜索词，供热门搜索聚合使用。
 */
import type { APIRoute } from 'astro';
import { recordSearchTerm } from '../../store.js';

export const POST: APIRoute = async ({ request }) => {
  const events = await readMetricEvents(request);
  if (!events) return new Response(null, { status: 400 });
  if (events.some(body => typeof body.term !== 'string' || !body.term.trim())) return new Response(null, { status: 400 });
  let recorded = false;
  for (const body of events) {
    const result = await recordSearchTerm(String(body.term), Number.isFinite(Number(body.resultCount)) ? Number(body.resultCount) : 0);
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

