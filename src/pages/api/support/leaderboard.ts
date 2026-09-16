/**
 * 文件说明: 返回已到账的公开赞赏名单，按身份累计金额排序且排除邮箱与订单资料。
 */
import type { APIRoute } from 'astro';
import { loadSupportLeaderboard } from '../../../support/SupportStore.js';
import { failure, json } from '../../../support/http.js';

export const GET: APIRoute = async ({ request }) => {
  try { return json({ ok: true, supporters: await loadSupportLeaderboard() }); }
  catch (error) { return failure(error, request.headers.get('x-cardnav-locale') || 'zh'); }
};
