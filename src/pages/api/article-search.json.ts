import type { APIRoute } from 'astro';
import { loadArticleSearchIndex } from '../../article-search.js';
export const prerender = false;
export const GET: APIRoute = async () => Response.json(await loadArticleSearchIndex(), {
  headers: {'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex'},
});
