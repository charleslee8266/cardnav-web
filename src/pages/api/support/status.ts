/**
 * 文件说明: 仅凭随机订单查询令牌返回是否到账，不返回赞赏身份或支付资料。
 */
import type { APIRoute } from 'astro';
import { SupportError } from '../../../support/EasyPay.js';
import { getSupportStore } from '../../../support/SupportStore.js';
import { failure, json, parameters } from '../../../support/http.js';

export const GET: APIRoute = async ({ url, request }) => {
  try {
    const { token } = parameters(url.search);
    const status = await getSupportStore().status(token || '');
    if (!status) throw new SupportError('orderNotFound', 404);
    return json({ ok: true, status });
  } catch (error) { return failure(error, request.headers.get('x-cardnav-locale') || 'zh'); }
};
