/**
 * 文件说明: 生成 CardNav 公开站点 sitemap index，拆分静态内容和数据库驱动入口。
 */
import type { APIRoute } from 'astro';
import { buildSitemapIndexXml } from '../seo-routes.js';
import { publicSiteUrl } from '../site.js';

export const prerender = true;

export const GET: APIRoute = () => {
  return new Response(buildSitemapIndexXml(publicSiteUrl, [
    { pathname: '/sitemap-static.xml' },
    { pathname: '/sitemap-guide.xml' },
    { pathname: '/sitemap-official-price.xml' },
    { pathname: '/sitemap-leaderboard.xml' },
    { pathname: '/sitemap-gateway-sites.xml' },
    { pathname: '/sitemap-gateway-models.xml' },
  ]), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};
