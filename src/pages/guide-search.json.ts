import type { APIRoute } from 'astro';
import { getGuideCollection } from '../guide.js';
import { supportedLocales } from '../i18n/config.js';
import { localizePath } from '../i18n/paths.js';
import { searchTextFromHtml } from '../search-text.js';
import type { GuideSearchEntry } from '../guide-search.js';
export const prerender = true;
export const GET: APIRoute = () => {
  const entries: GuideSearchEntry[] = supportedLocales.flatMap(locale =>
    getGuideCollection(locale).renderedGuideArticles.map(article => ({
      title: article.title, description: article.description,
      url: localizePath(`/guide/${article.slug}`, locale), locale,
      kind: article.slug === 'articles' ? 'article' as const : 'getting-started' as const, text: searchTextFromHtml(article.html),
    })),
  );
  return Response.json(entries);
};
