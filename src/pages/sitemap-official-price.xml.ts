/**
 * 文件说明: 运行时读取官方价格数据，生成官方价格详情页 sitemap。
 */
import type { APIRoute } from 'astro';
import { supportedLocales } from '../i18n/config.js';
import { buildOfficialPriceGroups } from '../official-price.js';
import { buildOfficialPriceSeoRoutes, buildSitemapXml, normalizePublicSeoRoutes } from '../seo-routes.js';
import { publicSiteUrl } from '../site.js';
import { loadOfficialPrices } from '../store.js';

export const GET: APIRoute = async () => {
  const officialPrices = await loadOfficialPrices();
  const officialPriceGroups = buildOfficialPriceGroups(officialPrices);
  const routes = normalizePublicSeoRoutes(supportedLocales.flatMap(locale => buildOfficialPriceSeoRoutes(officialPriceGroups, locale)));

  return new Response(buildSitemapXml(publicSiteUrl, routes), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};
