/**
 * 文件说明: 接收易支付 GET 异步通知，验签后幂等确认到账；浏览器回跳不参与入账。
 */
import type { APIRoute } from 'astro';
import { SupportError, EasyPay } from '../../../support/EasyPay.js';
import { getSupportStore } from '../../../support/SupportStore.js';
import { publishSupport } from '../../../support/SupportPublication.js';
import { parameters } from '../../../support/http.js';

export const GET: APIRoute = async ({ url }) => {
  const headers = { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' };
  try {
    const notification = new EasyPay().verify(parameters(url.search));
    const store = getSupportStore();
    const result = await store.credit(notification);
    if (result.effectsPending) {
      await publishSupport({ kind: result.kind, siteId: result.siteId });
      await store.markPublished(result.orderId);
    }
    return new Response('success', { headers });
  } catch (error) {
    console.warn('support_notify_rejected', { status: error instanceof SupportError ? error.status : 503 });
    return new Response('fail', { status: error instanceof SupportError ? error.status : 503, headers });
  }
};
