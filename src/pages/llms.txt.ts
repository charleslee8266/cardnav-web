/**
 * 文件说明: 生成 CardNav 公开站点 llms.txt。
 */
import type { APIRoute } from 'astro';
import { buildLlmsTxt } from '../seo-routes.js';
import { publicSiteUrl } from '../site.js';

export const GET: APIRoute = async () => {
  return new Response(buildLlmsTxt(publicSiteUrl), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};

