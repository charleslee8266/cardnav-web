import type { APIRoute } from 'astro';
import { loadArticleSitemap } from '../articles.js';
import { buildSitemapXml, type PublicSeoRoute } from '../seo-routes.js';
import { publicSiteUrl } from '../site.js';

export const GET: APIRoute = async () => {
  const articles = await loadArticleSitemap();
  const routes: PublicSeoRoute[] = [
    { pathname: '/articles', title: '文章精选', description: '', changefreq: 'daily' },
    ...articles.map(article => ({
      pathname: `/articles/${article.slug}`, title: '', description: '',
      changefreq: 'weekly' as const, lastmod: new Date(article.updated_at).toISOString(),
    })),
  ];
  return new Response(buildSitemapXml(publicSiteUrl, routes), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' },
  });
};
