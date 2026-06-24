/**
 * 文件说明: 生成 CardNav 公开站点 llms.txt，只列核心入口和静态 Guide，不展开大量数据库详情页。
 */
import type { APIRoute } from 'astro';
import { supportedLocales } from '../i18n/config.js';
import { buildLlmsTxt, getPublicSeoRoutes, loadGuideArticles, normalizePublicSeoRoutes } from '../seo-routes.js';
import { publicSiteUrl } from '../site.js';

export const prerender = true;

export const GET: APIRoute = async () => {
  const guideRouteEntries = await Promise.all(supportedLocales.map(async locale => [locale, await loadGuideArticles(locale)] as const));
  const guideRoutesByLocale = new Map(guideRouteEntries);
  const routes = normalizePublicSeoRoutes(supportedLocales.flatMap(locale => getPublicSeoRoutes(guideRoutesByLocale.get(locale) ?? [], locale)));
  return new Response(buildLlmsTxt(publicSiteUrl, routes), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};
