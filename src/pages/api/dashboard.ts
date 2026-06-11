/**
 * 文件说明: 提供公开首页后续加载所需的商家和商品数据快照。
 */
import type { APIRoute } from 'astro';
import { loadDashboardData } from '../../store.js';

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(await loadDashboardData()), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
};

