/**
 * 文件说明: 生成 CardNav 公开站点 llms.txt。
 */
import type { APIRoute } from 'astro';
import { buildModelLeaderboardGroups } from '../model-leaderboard.js';
import { buildOfficialPriceGroups } from '../official-price.js';
import { supportedLocales } from '../i18n/config.js';
import { buildLlmsTxt, getPublicSeoRoutesForAllLocales, loadGuideArticles } from '../seo-routes.js';
import { publicSiteUrl } from '../site.js';
import { loadModelLeaderboards, loadOfficialPrices } from '../store.js';

export const prerender = true;

export const GET: APIRoute = async () => {
  const [officialPrices, modelLeaderboards, guideRouteEntries] = await Promise.all([
    loadOfficialPrices(),
    loadModelLeaderboards(),
    Promise.all(supportedLocales.map(async locale => [locale, await loadGuideArticles(locale)] as const)),
  ]);
  const officialPriceGroups = buildOfficialPriceGroups(officialPrices);
  const modelLeaderboardGroups = buildModelLeaderboardGroups(modelLeaderboards);
  return new Response(buildLlmsTxt(publicSiteUrl, getPublicSeoRoutesForAllLocales({
    officialPriceGroups,
    modelLeaderboardGroups,
    guideRoutesByLocale: new Map(guideRouteEntries),
  })), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};
