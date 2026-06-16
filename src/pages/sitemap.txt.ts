/**
 * 文件说明: 生成 CardNav 公开站点纯文本 sitemap。
 */
import type { APIRoute } from 'astro';
import { buildOfficialPriceGroups } from '../official-price.js';
import { buildSitemapTxt, getPublicSeoRoutesWithOfficialPrices } from '../seo-routes.js';
import { publicSiteUrl } from '../site.js';
import { loadOfficialPrices } from '../store.js';

export const GET: APIRoute = async () => {
  const groups = buildOfficialPriceGroups(await loadOfficialPrices());
  return new Response(buildSitemapTxt(publicSiteUrl, getPublicSeoRoutesWithOfficialPrices(groups)), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};
