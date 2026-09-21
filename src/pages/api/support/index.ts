/**
 * 文件说明: 验证赞赏金额和公开站点，为浏览器生成服务端签名的易支付收银台地址。
 */
import type { APIRoute } from 'astro';
import { isLocale } from '../../../i18n/config.js';
import { EasyPay, SupportError, isSupportReturnPage } from '../../../support/EasyPay.js';
import { getSupportStore } from '../../../support/SupportStore.js';
import { supportKind, failure, json, orderParameters, OrderRateLimit } from '../../../support/http.js';

const limit = new OrderRateLimit();
export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    const provider = new EasyPay();
    limit.take(clientAddress);
    const params = await orderParameters(request, provider.origin);
    const kind = supportKind(params.kind);
    if (!/^(?:[1-9]\d{0,3})(?:\.\d{1,2})?$/.test(params.amount || '') || Number(params.amount) < 5 || Number(params.amount) > 5000) {
      throw new SupportError('invalidAmount');
    }
    if (params.paymentType !== 'alipay' && params.paymentType !== 'wxpay') throw new SupportError('selectPayment');
    if (!params.locale || !isLocale(params.locale) || (params.siteId?.length || 0) > 256) throw new SupportError('invalidParameters');
    if (!isSupportReturnPage(params.returnPage)) throw new SupportError('invalidReturnPage');
    const amountCents = Math.round(Number(params.amount) * 100);
    const order = await getSupportStore().create({ kind, siteId: params.siteId || null, amountCents,
      pid: provider.pid, paymentType: params.paymentType, nickname: params.nickname, email: params.email, message: params.message });
    return json({ ok: true, orderId: order.id, statusToken: order.statusToken,
      payUrl: await provider.checkout({ ...order, amountCents, paymentType: params.paymentType,
        returnPage: params.returnPage }, params.locale) }, 201);
  } catch (error) { return failure(error, request.headers.get('x-cardnav-locale') || 'zh'); }
};
