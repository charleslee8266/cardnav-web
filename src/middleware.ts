/**
 * 文件说明: 识别公开站点语言路径，并处理提交 API 请求。
 */
import { defineMiddleware } from 'astro:middleware';
import { defaultLocale, isLocale } from './i18n/config.js';
import { getMessages } from './i18n/messages.js';
import { getLocalePathInfo, localizePath } from './i18n/paths.js';
import {
  publicBrandAssetCacheControl,
  publicDevHtmlCacheControl,
  publicHtmlCacheControl,
  publicStaticAssetCacheControl,
} from './public-data-cache.js';
import { submitSiteUrl } from './store.js';

const brandAssetPathPattern = /^\/(favicon\.(?:webp|png)|og-cardnav\.(?:webp|png)|rightcode\.webp)$/;

function looksLikePublicPagePath(pathname: string) {
  if (pathname.startsWith('/api/') || pathname.startsWith('/_astro/')) return false;
  if (/\.[a-z0-9]+$/i.test(pathname)) return false;
  return true;
}

function isPublicHtmlResponse(pathname: string, contentType: string | null) {
  if (!looksLikePublicPagePath(pathname)) return false;
  // Astro SSR 在 middleware 之后才可能补上 Content-Type，不能只依赖响应头判断。
  return !contentType || contentType.includes('text/html');
}

function isDevRuntime() {
  return !import.meta.env.PROD;
}

function applyPublicResponseHeaders(pathname: string, response: Response, method: string) {
  const headers = new Headers(response.headers);
  if (method === 'GET' || method === 'HEAD') {
    const cacheControl = resolvePublicResponseCacheControl(
      pathname,
      headers.get('content-type'),
    );
    if (cacheControl && (isDevRuntime() || !headers.has('cache-control'))) {
      headers.set('Cache-Control', cacheControl);
      if (!isDevRuntime() && cacheControl.includes('public')) {
        headers.set('Vary', 'Accept-Encoding');
      }
    }
  }
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function resolvePublicResponseCacheControl(pathname: string, contentType: string | null) {
  if (!isPublicHtmlResponse(pathname, contentType)) {
    return null;
  }
  if (isDevRuntime()) {
    return publicDevHtmlCacheControl;
  }
  if (pathname.startsWith('/_astro/')) {
    return publicStaticAssetCacheControl;
  }
  if (brandAssetPathPattern.test(pathname)) {
    return publicBrandAssetCacheControl;
  }
  return publicHtmlCacheControl;
}

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

function applyLocaleLocals(
  context: Parameters<Parameters<typeof defineMiddleware>[0]>[0],
  localePathInfo: ReturnType<typeof getLocalePathInfo>,
  rewriteLocale?: string | null,
  rewriteOriginalPathname?: string | null,
) {
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
}

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const localePathInfo = getLocalePathInfo(url.pathname);

  if (!context.isPrerendered && localePathInfo.hasLocalePrefix && localePathInfo.locale === defaultLocale) {
    url.pathname = localePathInfo.routePathname;
    return context.redirect(url.pathname + url.search, 301);
  }

  if (context.isPrerendered) {
    applyLocaleLocals(context, localePathInfo);
    return next();
  }

  const rewriteLocale = context.request.headers.get('x-cardnav-rewrite-locale');
  const rewriteOriginalPathname = context.request.headers.get('x-cardnav-original-pathname');
  applyLocaleLocals(context, localePathInfo, rewriteLocale, rewriteOriginalPathname);

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
    const response = await context.rewrite(new Request(rewrittenUrl, {
      headers,
      method: context.request.method,
    }));
    return applyPublicResponseHeaders(localePathInfo.pathname, response, context.request.method);
  }

  const response = await next();
  return applyPublicResponseHeaders(url.pathname, response, context.request.method);
});
