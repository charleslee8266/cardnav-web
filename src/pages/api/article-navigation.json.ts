import type { APIRoute } from 'astro';
import { loadPublicArticleNavigation } from '../../articles.js';
export const prerender = false;
export const GET: APIRoute = async () => Response.json(await loadPublicArticleNavigation(), {
  headers: {'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex'},
});
