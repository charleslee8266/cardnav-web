/**
 * 文件说明: 服务端构建易支付收银台签名，并严格验证异步到账通知。
 * 参考资料: EasyPay submit.php 协议与 Sub2API 易支付 provider 的签名规则。
 */
import 'dotenv/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import { localizePath } from '../i18n/paths.js';
import { getMessages } from '../i18n/messages.js';
import type { Messages } from '../i18n/zh.js';
import type { Locale } from '../i18n/config.js';

export type SupportKind = 'person' | 'shop' | 'gateway';
const returnPaths = { shops: '/shops', gateways: '/llm-gateway', supporters: '/supporters' } as const;
export function supportReturnPath(page: SupportReturnPage, token: string, locale: Locale) {
  return localizePath(`${returnPaths[page]}?support-dialog&support-order=${token}`, locale);
}
export function supportResultPath(token: string, locale: Locale, outcome = '') {
  const suffix = new URLSearchParams({ token });
  if (outcome) suffix.set('payment', outcome);
  return localizePath(`/payment-result?${suffix.toString()}`, locale);
}
export type SupportReturnPage = keyof typeof returnPaths;
export function isSupportReturnPage(value: string | undefined): value is SupportReturnPage {
  return value !== undefined && Object.hasOwn(returnPaths, value);
}
export type PaymentType = 'alipay' | 'wxpay';
export type PaidNotification = { orderId: string; tradeNo: string; amountCents: number; pid: string; paymentType: PaymentType };

export class SupportError extends Error {
  constructor(readonly code: keyof Messages['supportErrors'], readonly status = 400) {
    super(getMessages('zh').supportErrors[code]);
  }
}

export class EasyPay {
  readonly pid: string;
  readonly origin: string;
  private readonly key: string;
  private readonly endpoint: URL;

  constructor() {
    this.pid = process.env.EASYPAY_PID?.trim() || '';
    this.key = process.env.EASYPAY_PKEY?.trim() || '';
    try {
      const site = new URL(process.env.PUBLIC_SITE_URL || '');
      const api = new URL(process.env.EASYPAY_API_URL || '');
      const localHttp = site.protocol === 'http:' && api.protocol === 'http:'
        && ['localhost', '127.0.0.1'].includes(site.hostname)
        && ['localhost', '127.0.0.1'].includes(api.hostname);
      if (!/^[A-Za-z0-9._-]{1,128}$/.test(this.pid) || !this.key || this.key.length > 512
        || (!localHttp && (site.protocol !== 'https:' || api.protocol !== 'https:'))
        || site.username || site.password || site.search || site.hash || site.pathname !== '/'
        || api.username || api.password || api.search || api.hash) throw new Error();
      this.origin = site.origin;
      api.pathname = `${api.pathname.replace(/\/(?:submit|mapi|api)\.php\/?$/i, '').replace(/\/+$/, '')}/submit.php`;
      this.endpoint = api;
    } catch {
      throw new SupportError('paymentUnavailable', 503);
    }
  }

  private sign(params: Record<string, string>) {
    const content = Object.keys(params).filter(key => key !== 'sign' && key !== 'sign_type' && params[key] !== '')
      .sort().map(key => `${key}=${params[key]}`).join('&');
    return createHash('md5').update(content + this.key, 'utf8').digest('hex');
  }

  checkout(order: { id: string; amountCents: number; paymentType: PaymentType; statusToken: string; returnPage: SupportReturnPage }, locale: Locale) {
    const returnPath = supportResultPath(order.statusToken, locale);
    const params: Record<string, string> = {
      pid: this.pid, type: order.paymentType, out_trade_no: order.id,
      notify_url: `${this.origin}/api/support/notify`, return_url: `${this.origin}${returnPath}`,
      name: getMessages(locale).support.title, money: (order.amountCents / 100).toFixed(2),
    };
    params.sign = this.sign(params);
    params.sign_type = 'MD5';
    const url = new URL(this.endpoint);
    url.search = new URLSearchParams(params).toString();
    return url.href;
  }

  verify(params: Record<string, string>): PaidNotification {
    const signature = params.sign || '';
    if (!/^[0-9a-f]{32}$/i.test(signature) || params.sign_type !== 'MD5'
      || !timingSafeEqual(Buffer.from(signature.toLowerCase(), 'hex'), Buffer.from(this.sign(params), 'hex'))
      || params.pid !== this.pid || params.trade_status !== 'TRADE_SUCCESS'
      || !/^cn_[0-9a-f]{32}$/.test(params.out_trade_no || '')
      || !/^[a-zA-Z0-9_-]{1,128}$/.test(params.trade_no || '')
      || !/^(?:[1-9]\d{0,3})(?:\.\d{1,2})?$/.test(params.money || '')
      || Number(params.money) < 5 || Number(params.money) > 5000
      || (params.type !== 'alipay' && params.type !== 'wxpay')) {
      throw new SupportError('invalidNotification');
    }
    return { orderId: params.out_trade_no!, tradeNo: params.trade_no!, amountCents: Math.round(Number(params.money) * 100),
      pid: params.pid, paymentType: params.type };
  }
}
