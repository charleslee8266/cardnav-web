/**
 * 文件说明: 生成 CardNav 公开站点纯文本 sitemap。
 */
import type { APIRoute } from 'astro';
import { supportedLocales } from '../i18n/config.js';
import { buildModelLeaderboardGroups } from '../model-leaderboard.js';
import { buildOfficialPriceGroups } from '../official-price.js';
import { buildSitemapTxt, getPublicSeoRoutesForAllLocales, loadGuideArticles } from '../seo-routes.js';
import { publicSiteUrl } from '../site.js';
import { loadModelLeaderboards, loadOfficialPrices, loadRelayModels, loadRelaySites } from '../store.js';

export const prerender = true;

export const GET: APIRoute = async () => {
  const [officialPrices, modelLeaderboards, relayData, relayModelData, guideRouteEntries] = await Promise.all([
    loadOfficialPrices(),
    loadModelLeaderboards(),
    loadRelaySites(),
    loadRelayModels(),
    Promise.all(supportedLocales.map(async locale => [locale, await loadGuideArticles(locale)] as const)),
  ]);
  const officialPriceGroups = buildOfficialPriceGroups(officialPrices);
  const modelLeaderboardGroups = buildModelLeaderboardGroups(modelLeaderboards);
  return new Response(buildSitemapTxt(publicSiteUrl, getPublicSeoRoutesForAllLocales({
    officialPriceGroups,
    modelLeaderboardGroups,
    relaySites: relayData.sites,
    relayModels: relayModelData.models,
    guideRoutesByLocale: new Map(guideRouteEntries),
  })), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};
