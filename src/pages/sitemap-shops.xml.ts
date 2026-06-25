/**
 * 文件说明: 运行时读取商家刷新时间，生成卡网商品主列表页 sitemap。
 */
import type { APIRoute } from 'astro';
import { supportedLocales } from '../i18n/config.js';
import { publicSitemapCacheControl } from '../public-data-cache.js';
import { buildQuickPlanSearchSeoRoutes, buildShopSeoRoutes, buildSitemapXml, normalizePublicSeoRoutes } from '../seo-routes.js';
import { publicSiteUrl } from '../site.js';
import { loadShopProductsData } from '../store.js';

function toSitemapLastmod(value: string | null) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

export const GET: APIRoute = async () => {
  const shopProductsData = await loadShopProductsData({ productLimit: 1 });
  const lastmod = toSitemapLastmod(shopProductsData.latestRefreshedAt);
  const routes = normalizePublicSeoRoutes(supportedLocales.flatMap(locale => [
    ...buildShopSeoRoutes(lastmod, locale),
    ...buildQuickPlanSearchSeoRoutes(locale),
  ]));

  return new Response(buildSitemapXml(publicSiteUrl, routes), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': publicSitemapCacheControl,
    },
  });
};