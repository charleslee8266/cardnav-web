/** 文章索引按公开记录修订更新，正文转换结果在进程内复用。 */
import { getPool } from './store.js';
import { searchTextFromMarkdown } from './search-text.js';
import type { GuideSearchEntry } from './guide-search.js';
let cached: {revision: string; entries: GuideSearchEntry[]} | undefined;
let building: {revision: string; promise: Promise<GuideSearchEntry[]>} | undefined;
export async function loadArticleSearchIndex(): Promise<GuideSearchEntry[]> {
  const db = getPool();
  const meta = (await db.query(`SELECT count(*)::text AS count, max(updated_at)::text AS updated FROM articles WHERE status='published'`)).rows[0];
  const revision = `${meta.count}:${meta.updated}`;
  if (cached?.revision === revision) return cached.entries;
  if (building?.revision === revision) return building.promise;
  const promise = db.query(`SELECT slug,title,summary,content_markdown FROM articles WHERE status='published' ORDER BY sort_order ASC,published_at DESC,id`).then(result => {
    const entries: GuideSearchEntry[] = result.rows.map(row => ({
      title: row.title, url: `/guide/${row.slug}`, description: row.summary,
      text: searchTextFromMarkdown(row.content_markdown), kind: 'article',
    }));
    cached = {revision, entries};
    return entries;
  });
  const pending = {revision, promise};
  building = pending;
  try { return await promise; } finally { if (building === pending) building = undefined; }
}
