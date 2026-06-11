/**
 * 文件说明: 生成 CardNav 公开站点 XML sitemap。
 */
import type { APIRoute } from 'astro';
import { buildSitemapXml } from '../seo-routes.js';
import { publicSiteUrl } from '../site.js';

export const GET: APIRoute = async () => {
  return new Response(buildSitemapXml(publicSiteUrl), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};

