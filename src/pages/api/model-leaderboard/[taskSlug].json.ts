import { matchesLeaderboardHighlight } from '../../../models/leaderboard-highlight.js';
/**
 * 文件说明: 提供模型排行榜完整行数据 JSON，供公开榜单页按需加载。
 */
import type { APIRoute } from 'astro';
import { localizePath } from '../../../i18n/paths.js';
import { isLocale } from '../../../i18n/config.js';
import { getMessages } from '../../../i18n/messages.js';
import { localizeModelLeaderboardGroups } from '../../../localized-display.js';
import { buildModelLeaderboardGroups } from '../../../model-leaderboard.js';
import {
  publicReadApiCacheControl,
  publicReadApiCloudflareCacheControl,
} from '../../../public-data-cache.js';
import { loadModelLeaderboardRowsForTask } from '../../../store.js';

export const GET: APIRoute = async ({ params, request }) => {
  const url = new URL(request.url);
  const rawLocale = url.searchParams.get('locale') || '';
  const messages = getMessages(isLocale(rawLocale) ? rawLocale : 'zh');
  const taskSlug = params.taskSlug || '';
  const activeRows = await loadModelLeaderboardRowsForTask(taskSlug);
  const groups = localizeModelLeaderboardGroups(
    buildModelLeaderboardGroups(activeRows),
    messages,
  );
  const currentGroup = groups.find(group => group.taskSlug === taskSlug);

  if (!currentGroup) {
    return new Response(JSON.stringify({ rows: [] }), {
      status: 404,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': publicReadApiCacheControl,
        'cloudflare-cdn-cache-control': publicReadApiCloudflareCacheControl,
      },
    });
  }

  return new Response(JSON.stringify({
    totalCount: currentGroup.rows.length,
    rows: currentGroup.rows.map(row => ({
      highlighted: matchesLeaderboardHighlight(row, url.searchParams.getAll('family'), url.searchParams.get('q') || '', url.searchParams.getAll('provider')),
      rank: row.rank,
      modelName: row.modelName,
      modelOrganization: row.modelOrganization,
      modelFamily: row.modelFamily,
      gatewayPath: row.gatewayPath ? localizePath(row.gatewayPath, isLocale(rawLocale) ? rawLocale : 'zh') : null,
      shopPath: row.shopPath ? localizePath(row.shopPath, isLocale(rawLocale) ? rawLocale : 'zh') : null,
      score: row.score,
    })),
  }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': publicReadApiCacheControl,
      'cloudflare-cdn-cache-control': publicReadApiCloudflareCacheControl,
    },
  });
};
