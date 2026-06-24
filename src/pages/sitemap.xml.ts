/**
 * 文件说明: 生成 CardNav 公开站点 XML sitemap。
 */
import type { APIRoute } from 'astro';
import { buildModelLeaderboardGroups } from '../model-leaderboard.js';
import { buildOfficialPriceGroups } from '../official-price.js';
import { supportedLocales } from '../i18n/config.js';
import { buildSitemapXml, getPublicSeoRoutesForAllLocales, loadGuideArticles } from '../seo-routes.js';
import { publicSiteUrl } from '../site.js';
import { loadModelLeaderboards, loadOfficialPrices, loadGatewayModels, loadGatewaySites } from '../store.js';

export const prerender = true;

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
  return new Response(buildSitemapXml(publicSiteUrl, getPublicSeoRoutesForAllLocales({
    officialPriceGroups,
    modelLeaderboardGroups,
    gatewaySites: gatewayData.sites,
    gatewayModels: gatewayModelData.models,
    guideRoutesByLocale: new Map(guideRouteEntries),
  })), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};
