/** 浏览器中的全文匹配；JSON 索引只包含公开内容。 */
import { type Locale } from './i18n/config.js';
import { localizePath } from './i18n/paths.js';
export interface GuideSearchEntry {
  title: string;
  url: string;
  description: string;
  text: string;
  kind: 'getting-started' | 'article';
  locale?: string;
}
export interface GuideSearchResult { entry: GuideSearchEntry; snippet: string; score: number; }
export function localizeGuideSearchEntries(entries: GuideSearchEntry[], locale: Locale) {
  return entries.filter(entry => !entry.locale || entry.locale === locale)
    .map(entry => ({...entry, url: localizePath(entry.url, locale)}));
}
const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase();
export function searchGuides(entries: GuideSearchEntry[], query: string): GuideSearchResult[] {
  const terms = normalize(query.trim()).split(/\s+/u).filter(Boolean);
  if (!terms.length) return [];
  return entries.flatMap(entry => {
    const title = normalize(entry.title);
    const description = normalize(entry.description);
    const text = normalize(entry.text);
    if (!terms.every(term => `${title}\n${description}\n${text}`.includes(term))) return [];
    const score = terms.reduce((sum, term) => sum + (title.includes(term) ? 10 : 0) + (description.includes(term) ? 3 : 0) + (text.includes(term) ? 1 : 0), 0);
    const position = Math.max(0, text.indexOf(terms[0]));
    const start = Math.max(0, position - 45);
    const snippet = `${start ? '…' : ''}${entry.text.slice(start, start + 180)}${entry.text.length > start + 180 ? '…' : ''}`;
    return [{entry, score, snippet}];
  }).sort((a, b) => b.score - a.score);
}
