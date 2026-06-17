/**
 * 文件说明: 生成 CardNav 公开站点 XML sitemap。
 */
import type { APIRoute } from 'astro';
import { buildModelLeaderboardGroups } from '../model-leaderboard.js';
import { buildOfficialPriceGroups } from '../official-price.js';
import { buildSitemapXml, getPublicSeoRoutesWithDynamicPages, loadGuideArticles } from '../seo-routes.js';
import { publicSiteUrl } from '../site.js';
import { loadModelLeaderboards, loadOfficialPrices } from '../store.js';

export const GET: APIRoute = async () => {
  const [officialPrices, modelLeaderboards, guideRoutes] = await Promise.all([
    loadOfficialPrices(),
    loadModelLeaderboards(),
    loadGuideArticles(),
  ]);
  const officialPriceGroups = buildOfficialPriceGroups(officialPrices);
  const modelLeaderboardGroups = buildModelLeaderboardGroups(modelLeaderboards);
  return new Response(buildSitemapXml(publicSiteUrl, getPublicSeoRoutesWithDynamicPages({ officialPriceGroups, modelLeaderboardGroups, guideRoutes })), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};
