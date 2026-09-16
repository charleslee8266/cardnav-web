/**
 * 文件说明: 仅在本地开发环境模拟赞赏到账，复用账本与金额累计，不访问支付平台或缓存服务。
 */
import type { Locale } from '../i18n/config.js';
import { SupportError, supportReturnPath, type SupportReturnPage, type PaymentType } from './EasyPay.js';
import { getSupportStore } from './SupportStore.js';

export class SupportDebugPayment {
  readonly pid = 'local-debug';
  readonly origin: string;

  static fromEnv(requestUrl: string) {
    if (process.env.SUPPORT_PAYMENT_DEBUG !== 'true') return undefined;
    return new SupportDebugPayment(requestUrl);
  }

  private constructor(requestUrl: string) {
    const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
    const request = new URL(requestUrl);
    const database = new URL(process.env.DATABASE_URL || '');
    if (process.env.NODE_ENV !== 'development' || !localHosts.has(request.hostname)
      || !localHosts.has(database.hostname)) throw new SupportError('paymentUnavailable', 503);
    this.origin = request.origin;
  }

  async checkout(order: { id: string; amountCents: number; paymentType: PaymentType; statusToken: string; returnPage: SupportReturnPage }, locale: Locale) {
    const store = getSupportStore();
    await store.credit({ orderId: order.id, tradeNo: `debug_${order.id}`, amountCents: order.amountCents,
      pid: this.pid, paymentType: order.paymentType });
    await store.markPublished(order.id);
    return `${this.origin}${supportReturnPath(order.returnPage, order.statusToken, locale)}`;
  }
}
