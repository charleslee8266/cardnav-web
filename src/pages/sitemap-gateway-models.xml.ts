/**
 * 文件说明: 运行时读取中转站模型数据，只把高价值模型详情页写入 sitemap。
 */
import type { APIRoute } from 'astro';
import { publicSitemapCacheControl } from '../public-data-cache.js';
import { supportedLocales } from '../i18n/config.js';
import { buildGatewayModelSeoRoutes, buildSitemapXml, normalizePublicSeoRoutes } from '../seo-routes.js';
import { publicSiteUrl } from '../site.js';
import { loadGatewayModels } from '../store.js';

export const GET: APIRoute = async () => {
  const gatewayModelData = await loadGatewayModels();
  const routes = normalizePublicSeoRoutes(supportedLocales.flatMap(locale => buildGatewayModelSeoRoutes(gatewayModelData.models, locale)));
  return new Response(buildSitemapXml(publicSiteUrl, routes), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': publicSitemapCacheControl,
    },
  });
};
