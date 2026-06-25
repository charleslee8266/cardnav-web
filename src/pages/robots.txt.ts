/**
 * 文件说明: 生成 CardNav 公开站点 robots.txt。
 */
import type { APIRoute } from 'astro';
import { publicSitemapCacheControl } from '../public-data-cache.js';
import { buildRobotsTxt } from '../seo-routes.js';
import { publicSiteUrl } from '../site.js';

export const GET: APIRoute = async () => {
  return new Response(buildRobotsTxt(publicSiteUrl), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': publicSitemapCacheControl,
    },
  });
};

