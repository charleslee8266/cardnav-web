/**
 * 文件说明: 维护模型排行榜页的任务分组、排序和独立 URL 规则。
 */
import type { PublicModelLeaderboardRow } from './store.js';

export type ModelLeaderboardGroup<Row extends PublicModelLeaderboardRow = PublicModelLeaderboardRow> = {
  taskSlug: string;
  displayName: string;
  pathname: string;
  rows: Row[];
};

const taskOrder = ['coding', 'creative-writing', 'math', 'text-to-image'];

function orderedIndex(values: string[], value: string) {
  const index = values.indexOf(value);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export function modelLeaderboardPathname(taskSlug: string) {
  return `/model-leaderboard/${taskSlug}`;
}

export function buildModelLeaderboardGroups(rows: PublicModelLeaderboardRow[]): ModelLeaderboardGroup[] {
  const groupMap = new Map<string, ModelLeaderboardGroup>();

  for (const row of rows) {
    const existing = groupMap.get(row.taskSlug);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    groupMap.set(row.taskSlug, {
      taskSlug: row.taskSlug,
      displayName: row.taskSlug,
      pathname: modelLeaderboardPathname(row.taskSlug),
      rows: [row],
    });
  }

  return Array.from(groupMap.values())
    .map(group => ({
      ...group,
      rows: group.rows.sort((a, b) => a.rank - b.rank),
    }))
    .sort((a, b) => {
      const orderDiff = orderedIndex(taskOrder, a.taskSlug) - orderedIndex(taskOrder, b.taskSlug);
      if (orderDiff !== 0) return orderDiff;
      return a.taskSlug.localeCompare(b.taskSlug, 'zh-Hans-CN', { numeric: true });
    });
}
