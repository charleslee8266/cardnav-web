/**
 * 文件说明: 使用赞赏订单令牌取消尚未支付的订单。
 */
import type { APIRoute } from 'astro';
import { SupportError } from '../../../support/EasyPay.js';
import { getSupportStore } from '../../../support/SupportStore.js';
import { failure, json, parameters } from '../../../support/http.js';

export const POST: APIRoute = async ({ request, url }) => {
  try {
    const { token } = parameters(url.search);
    if (!token) throw new SupportError('orderNotFound', 404);
    if (!await getSupportStore().cancel(token)) throw new SupportError('orderNotFound', 404);
    return json({ ok: true, status: 'cancelled' });
  } catch (error) { return failure(error, request.headers.get('x-cardnav-locale') || 'zh'); }
};
