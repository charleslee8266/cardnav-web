import { readMetricEvents } from '../../metric-request.js';
import type { APIRoute } from 'astro';
import { recordGatewayEngagement } from '../../store.js';

export const POST: APIRoute = async ({ request }) => {
  const events = await readMetricEvents(request);
  if (!events || events.some(body => typeof body.subjectId !== 'string' || typeof body.visitorId !== 'string'
    || !['site', 'model'].includes(String(body.subjectType))
    || !['detail', 'open'].includes(String(body.eventType)))) return new Response(null, { status: 400 });
  let recorded = false;
  for (const body of events) {
    const result = await recordGatewayEngagement(body as Parameters<typeof recordGatewayEngagement>[0]);
    recorded ||= result.recorded;
  }
  return new Response(null, { status: recorded ? 202 : 204, headers: { 'cache-control': 'no-store' } });
};
