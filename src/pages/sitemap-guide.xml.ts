/**
 * 文件说明: 构建期扫描 Guide Markdown，生成 Guide 内容页 sitemap。
 */
import type { APIRoute } from 'astro';
import { supportedLocales } from '../i18n/config.js';
import { publicSitemapCacheControl } from '../public-data-cache.js';
import { buildSitemapXml, getPublicSeoRoutes, loadGuideArticles, normalizePublicSeoRoutes } from '../seo-routes.js';
import { publicSiteUrl } from '../site.js';

export const prerender = true;

export const GET: APIRoute = async () => {
  const guideRouteEntries = await Promise.all(supportedLocales.map(async locale => [locale, await loadGuideArticles(locale)] as const));
  const guideRoutesByLocale = new Map(guideRouteEntries);
  const routes = normalizePublicSeoRoutes(supportedLocales.flatMap(locale => {
    const guideArticles = guideRoutesByLocale.get(locale) ?? [];
    return getPublicSeoRoutes(guideArticles, locale).filter(route => route.pathname.includes('/guide/'));
  }));

  return new Response(buildSitemapXml(publicSiteUrl, routes), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': publicSitemapCacheControl,
    },
  });
};
