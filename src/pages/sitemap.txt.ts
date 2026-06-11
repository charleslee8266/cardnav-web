/**
 * 文件说明: 生成 CardNav 公开站点纯文本 sitemap。
 */
import type { APIRoute } from 'astro';
import { buildSitemapTxt } from '../seo-routes.js';
import { publicSiteUrl } from '../site.js';

export const GET: APIRoute = async () => {
  return new Response(buildSitemapTxt(publicSiteUrl), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};

