/**
 * 文件说明: 运行时读取中转站数据，生成中转站详情页 sitemap。
 */
import type { APIRoute } from 'astro';
import { publicSitemapCacheControl } from '../public-data-cache.js';
import { supportedLocales } from '../i18n/config.js';
import { buildGatewaySeoRoutes, buildSitemapXml, normalizePublicSeoRoutes } from '../seo-routes.js';
import { publicSiteUrl } from '../site.js';
import { loadGatewaySites } from '../store.js';

export const GET: APIRoute = async () => {
  const gatewayData = await loadGatewaySites();
  const routes = normalizePublicSeoRoutes(supportedLocales.flatMap(locale => buildGatewaySeoRoutes(gatewayData.sites, locale)));

  return new Response(buildSitemapXml(publicSiteUrl, routes), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': publicSitemapCacheControl,
    },
  });
};
