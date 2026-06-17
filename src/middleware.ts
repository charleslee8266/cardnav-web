/**
 * 文件说明: 识别公开站点语言路径，并处理提交 API 请求。
 */
import { defineMiddleware } from 'astro:middleware';
import { isLocale } from './i18n/config.js';
import { getMessages } from './i18n/messages.js';
import { getLocalePathInfo, localizePath } from './i18n/paths.js';
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
  const rewriteLocale = context.request.headers.get('x-cardnav-rewrite-locale');
  const rewriteOriginalPathname = context.request.headers.get('x-cardnav-original-pathname');
  const localePathInfo = getLocalePathInfo(url.pathname);
  const locale = rewriteLocale && isLocale(rewriteLocale) ? rewriteLocale : localePathInfo.locale;
  const hasLocalePrefix = localePathInfo.hasLocalePrefix || Boolean(rewriteLocale && isLocale(rewriteLocale));
  context.locals.locale = locale;
  context.locals.routePathname = localePathInfo.routePathname;
  context.locals.originalPathname = rewriteOriginalPathname || localePathInfo.pathname;
  context.locals.hasLocalePrefix = hasLocalePrefix;
  context.locals.messages = getMessages(locale);
  context.locals.localizePath = (pathname: string) =>
    localizePath(pathname, locale, {
      prefixDefaultLocale: hasLocalePrefix,
    });

  if (context.request.method === 'POST' && url.pathname === '/api/submit') {
    const contentType = context.request.headers.get('content-type') ?? '';
    const submittedUrl = contentType.includes('application/json')
      ? String(((await context.request.json().catch(() => null)) as { url?: unknown } | null)?.url ?? '')
      : String((await context.request.formData()).get('url') ?? '');
    const result = await submitSiteUrl(submittedUrl);
    if (!result.ok) {
      return jsonResponse({ ok: false, message: context.locals.messages.submit[result.errorKey] }, { status: 400 });
    }
    return jsonResponse({ ok: true, message: context.locals.messages.submit.success });
  }

  if (localePathInfo.hasLocalePrefix) {
    const rewrittenUrl = new URL(context.request.url);
    rewrittenUrl.pathname = localePathInfo.routePathname;
    const headers = new Headers(context.request.headers);
    headers.set('x-cardnav-rewrite-locale', localePathInfo.locale);
    headers.set('x-cardnav-original-pathname', localePathInfo.pathname);
    return context.rewrite(new Request(rewrittenUrl, {
      headers,
      method: context.request.method,
    }));
  }

  return next();
});
