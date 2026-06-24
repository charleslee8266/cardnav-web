/**
 * 文件说明: 生成真正不依赖数据库的固定页面、工具页和固定搜索落地页 sitemap。
 */
import type { APIRoute } from 'astro';
import { supportedLocales } from '../i18n/config.js';
import {
  buildQuickPlanSearchSeoRoutes,
  buildSitemapXml,
  getStaticPublicSeoRoutes,
  normalizePublicSeoRoutes,
} from '../seo-routes.js';
import { publicSiteUrl } from '../site.js';

export const prerender = true;

export const GET: APIRoute = () => {
  const routes = normalizePublicSeoRoutes(supportedLocales.flatMap(locale => [
    ...getStaticPublicSeoRoutes(locale),
    ...buildQuickPlanSearchSeoRoutes(locale),
  ]));

  return new Response(buildSitemapXml(publicSiteUrl, routes), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};
