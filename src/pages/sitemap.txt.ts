/**
 * 文件说明: 生成 CardNav 公开站点纯文本 sitemap，运行时混合静态和筛选后的数据库入口。
 */
import type { APIRoute } from 'astro';
import { supportedLocales } from '../i18n/config.js';
import { publicSitemapCacheControl } from '../public-data-cache.js';
import { buildModelLeaderboardGroups } from '../model-leaderboard.js';
import { buildOfficialPriceGroups } from '../official-price.js';
import {
  buildGatewayModelSeoRoutes,
  buildGatewaySeoRoutes,
  buildModelLeaderboardSeoRoutes,
  buildOfficialPriceSeoRoutes,
  buildSitemapTxt,
  getPublicSeoRoutes,
  loadGuideArticles,
  normalizePublicSeoRoutes,
} from '../seo-routes.js';
import { publicSiteUrl } from '../site.js';
import { loadModelLeaderboards, loadOfficialPrices, loadGatewayModels, loadGatewaySites } from '../store.js';

export const GET: APIRoute = async () => {
  const [officialPrices, modelLeaderboards, gatewayData, gatewayModelData, guideRouteEntries] = await Promise.all([
    loadOfficialPrices(),
    loadModelLeaderboards(),
    loadGatewaySites(),
    loadGatewayModels(),
    Promise.all(supportedLocales.map(async locale => [locale, await loadGuideArticles(locale)] as const)),
  ]);
  const officialPriceGroups = buildOfficialPriceGroups(officialPrices);
  const modelLeaderboardGroups = buildModelLeaderboardGroups(modelLeaderboards);
  const guideRoutesByLocale = new Map(guideRouteEntries);
  const routes = normalizePublicSeoRoutes(supportedLocales.flatMap(locale => [
    ...getPublicSeoRoutes(guideRoutesByLocale.get(locale) ?? [], locale),
    ...buildOfficialPriceSeoRoutes(officialPriceGroups, locale),
    ...buildModelLeaderboardSeoRoutes(modelLeaderboardGroups, locale),
    ...buildGatewaySeoRoutes(gatewayData.sites, locale),
    ...buildGatewayModelSeoRoutes(gatewayModelData.models, locale),
  ]));
  return new Response(buildSitemapTxt(publicSiteUrl, routes), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': publicSitemapCacheControl,
    },
  });
};
