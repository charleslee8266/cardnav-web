/**
 * 文件说明: 接收公开中转站资料提交，写入 accepted 候选队列等待 worker ingest。
 */
import type { APIRoute } from 'astro';
import { isLocale } from '../../i18n/config.js';
import { getMessages } from '../../i18n/messages.js';
import { submitGatewaySite } from '../../store.js';

export const POST: APIRoute = async ({ request, locals }) => {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const requestedLocale = typeof body.locale === 'string' && isLocale(body.locale) ? body.locale : locals.locale;
  const messages = getMessages(requestedLocale);
  const paymentMethods = Array.isArray(body.paymentMethods)
    ? body.paymentMethods.filter((value): value is string => typeof value === 'string')
    : [];
  const result = await submitGatewaySite({
    url: typeof body.url === 'string' ? body.url : '',
    apiEndpoint: typeof body.apiEndpoint === 'string' ? body.apiEndpoint : '',
    name: typeof body.name === 'string' ? body.name : '',
    summary: typeof body.summary === 'string' ? body.summary : '',
    paymentMethods,
  });
  if (!result.ok) {
    const message = messages.submit[result.errorKey as keyof typeof messages.submit];
    return new Response(JSON.stringify({ ok: false, message }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  return new Response(JSON.stringify({ ok: true, message: messages.submit.success }), {
    status: 202,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
};
