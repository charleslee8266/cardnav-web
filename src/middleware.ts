/**
 * 文件说明: 处理公开站点的 API 请求。
 */
import { defineMiddleware } from 'astro:middleware';
import { submitSiteUrl } from './store.js';

function jsonResponse(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...init.headers,
    },
  });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  if (context.request.method === 'POST' && url.pathname === '/api/submit') {
    const contentType = context.request.headers.get('content-type') ?? '';
    const submittedUrl = contentType.includes('application/json')
      ? String(((await context.request.json().catch(() => null)) as { url?: unknown } | null)?.url ?? '')
      : String((await context.request.formData()).get('url') ?? '');
    const result = await submitSiteUrl(submittedUrl);
    if (!result.ok) {
      return jsonResponse({ ok: false, message: result.message }, { status: 400 });
    }
    return jsonResponse({ ok: true, message: '提交成功' });
  }

  return next();
});
