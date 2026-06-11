/**
 * 文件说明: 处理 Astro 文件路由无法与页面同路径共存的公开 POST 请求。
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
  if (context.request.method === 'POST' && url.pathname === '/submit') {
    const formData = await context.request.formData();
    const result = await submitSiteUrl(String(formData.get('url') ?? ''));
    if (!result.ok) {
      return jsonResponse({ ok: false, message: result.message }, { status: 400 });
    }
    return jsonResponse({ ok: true, message: '提交成功' });
  }

  return next();
});
