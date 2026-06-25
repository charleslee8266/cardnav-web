/**
 * 文件说明: 提供模型排行榜首屏之后的行数据 JSON，供公开榜单页按需加载。
 */
import type { APIRoute } from 'astro';
import { isLocale } from '../../../i18n/config.js';
import { getMessages } from '../../../i18n/messages.js';
import { localizeModelLeaderboardGroups } from '../../../localized-display.js';
import { buildModelLeaderboardGroups } from '../../../model-leaderboard.js';
import { publicReadApiCacheControl } from '../../../public-data-cache.js';
import { loadModelLeaderboardRowsForTask } from '../../../store.js';

export const GET: APIRoute = async ({ params, request }) => {
  const url = new URL(request.url);
  const offset = Math.max(0, Number(url.searchParams.get('offset') || '0') || 0);
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
      },
    });
  }

  return new Response(JSON.stringify({
    rows: currentGroup.rows.slice(offset).map(row => ({
      rank: row.rank,
      modelName: row.modelName,
      score: row.score,
    })),
  }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': publicReadApiCacheControl,
    },
  });
};
