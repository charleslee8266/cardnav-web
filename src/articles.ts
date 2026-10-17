/** 公开文章读取；只返回已发布内容和页面所需字段。 */
import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';
import { getPool } from './store.js';
export interface PublicArticleSummary {
  slug:string; title:string; summary:string; author:string; sourceName:string;
  sourceUrl:string; sourceTitle:string; sourcePublishedAt:string|null; publishedAt:string; updatedAt:string;
}
export interface PublicArticle extends PublicArticleSummary { contentHtml:string; }
const markdownRenderer = new MarkdownIt({html:false,linkify:false,breaks:false});
const fields=`slug,title,summary,author,source_name AS "sourceName",source_url AS "sourceUrl",source_title AS "sourceTitle",source_published_at AS "sourcePublishedAt",published_at AS "publishedAt",updated_at AS "updatedAt"`;
export async function loadPublicArticles(page=1) {
  const limit=20;
  const db=getPool();
  const [list,total]=await Promise.all([
    db.query(`SELECT ${fields} FROM articles WHERE status='published' ORDER BY sort_order ASC,published_at DESC,id LIMIT $1 OFFSET $2`,[limit,(page-1)*limit]),
    db.query(`SELECT count(*)::int AS count FROM articles WHERE status='published'`),
  ]);
  return {articles:list.rows as PublicArticleSummary[],total:Number(total.rows[0].count),page,pageSize:limit};
}
/** 完整侧栏目录，不受文章列表分页限制。 */
export async function loadPublicArticleNavigation(): Promise<Pick<PublicArticleSummary, 'slug' | 'title'>[]> {
  return (await getPool().query(`SELECT slug,title FROM articles WHERE status='published' ORDER BY sort_order ASC,published_at DESC,id`)).rows;
}
export function sanitizePublicArticle(html:string) {
  return sanitizeHtml(html,{
    allowedTags:[...sanitizeHtml.defaults.allowedTags,'img','figure','figcaption'],
    allowedAttributes:{a:['href','title','rel','target'],img:['src','alt','title','loading','referrerpolicy'],th:['colspan','rowspan'],td:['colspan','rowspan']},
    allowedSchemes:['http','https'],allowProtocolRelative:false,
    transformTags:{a:(_tag,attrs)=>({tagName:'a',attribs:{...attrs,rel:'nofollow noopener noreferrer',target:'_blank'}}),img:(_tag,attrs)=>({tagName:'img',attribs:{...attrs,loading:'lazy',referrerpolicy:'no-referrer'}})},
  });
}
export function renderPublicArticleMarkdown(markdown: string) {
  return sanitizePublicArticle(markdownRenderer.render(markdown));
}
export async function loadPublicArticle(slug:string):Promise<PublicArticle|null> {
  const row=(await getPool().query(`SELECT ${fields},content_markdown AS "contentMarkdown" FROM articles WHERE slug=$1 AND status='published'`,[slug])).rows[0];
  if (!row) return null;
  const {contentMarkdown, ...article} = row;
  return {...article,contentHtml:renderPublicArticleMarkdown(contentMarkdown)};
}
export async function loadArticleSitemap() {
  return (await getPool().query(`SELECT slug,updated_at FROM articles WHERE status='published' ORDER BY sort_order ASC,published_at DESC,id`)).rows as {slug:string;updated_at:Date}[];
}
export function articleDate(value:string|null) {
  return value?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value)):'';
}
