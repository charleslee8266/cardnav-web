/**
 * 文件说明: 运行时读取商家刷新时间，生成卡网商品列表、关键词和商家详情 sitemap。
 */
import type { APIRoute } from 'astro';
import { supportedLocales } from '../i18n/config.js';
import { publicSitemapCacheControl } from '../public-data-cache.js';
import { buildQuickPlanSearchSeoRoutes, buildShopDetailSeoRoutes, buildShopSeoRoutes, buildSitemapXml, normalizePublicSeoRoutes } from '../seo-routes.js';
import { publicSiteUrl } from '../site.js';
import { loadShopProductsData } from '../store.js';
import { loadPublicShops } from '../public-shops.js';

function toSitemapLastmod(value: string | null | undefined) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

export const GET: APIRoute = async () => {
  const [shopProductsData, shops] = await Promise.all([
    loadShopProductsData({ productLimit: 1 }),
    loadPublicShops(),
  ]);
  const lastmod = toSitemapLastmod(shopProductsData.latestRefreshedAt);
  const routes = normalizePublicSeoRoutes(supportedLocales.flatMap(locale => [
    ...buildShopSeoRoutes(lastmod, locale),
    ...buildQuickPlanSearchSeoRoutes(locale),
    ...buildShopDetailSeoRoutes(shops, locale),
  ]));

  return new Response(buildSitemapXml(publicSiteUrl, routes), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': publicSitemapCacheControl,
    },
  });
};
