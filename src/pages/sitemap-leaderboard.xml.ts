/**
 * 文件说明: 运行时读取模型排行榜数据，生成排行榜详情页 sitemap。
 */
import type { APIRoute } from 'astro';
import { publicSitemapCacheControl } from '../public-data-cache.js';
import { supportedLocales } from '../i18n/config.js';
import { buildModelLeaderboardGroups } from '../model-leaderboard.js';
import { buildModelLeaderboardSeoRoutes, buildSitemapXml, normalizePublicSeoRoutes } from '../seo-routes.js';
import { publicSiteUrl } from '../site.js';
import { loadModelLeaderboards } from '../store.js';

export const GET: APIRoute = async () => {
  const modelLeaderboards = await loadModelLeaderboards();
  const modelLeaderboardGroups = buildModelLeaderboardGroups(modelLeaderboards);
  const routes = normalizePublicSeoRoutes(supportedLocales.flatMap(locale => buildModelLeaderboardSeoRoutes(modelLeaderboardGroups, locale)));

  return new Response(buildSitemapXml(publicSiteUrl, routes), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': publicSitemapCacheControl,
    },
  });
};
