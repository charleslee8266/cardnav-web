/**
 * 文件说明: 限制赞赏接口请求大小、重复参数、跨站创建和订单请求频率。
 */
import { getMessages } from '../i18n/messages.js';
import { isLocale } from '../i18n/config.js';
import { SupportError, type SupportKind } from './EasyPay.js';

export function parameters(raw: string, maxBytes = 8192) {
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) throw new SupportError('requestTooLarge', 413);
  const result: Record<string, string> = Object.create(null);
  let count = 0;
  for (const [key, value] of new URLSearchParams(raw)) {
    if (Object.hasOwn(result, key) || key.length > 64 || value.length > 2048 || ++count > 32) {
      throw new SupportError('invalidParameters');
    }
    result[key] = value;
  }
  return result;
}

export function supportKind(value: string | undefined): SupportKind {
  if (value !== 'person' && value !== 'shop' && value !== 'gateway') throw new SupportError('selectKind');
  return value;
}

export async function orderParameters(request: Request, origin: string) {
  if (request.headers.get('origin') !== origin || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new SupportError('sameOriginRequired', 403);
  }
  if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/x-www-form-urlencoded') {
    throw new SupportError('invalidFormat', 415);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new SupportError('emptyRequest');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); throw new SupportError('requestTooLarge', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const params = parameters(Buffer.concat(chunks).toString('utf8'), 4096);
  if (Object.keys(params).some(key => !['kind', 'siteId', 'amount', 'paymentType', 'locale', 'returnPage', 'nickname', 'email', 'message'].includes(key))) {
    throw new SupportError('invalidParameters');
  }
  return params;
}

export class OrderRateLimit {
  private readonly buckets = new Map<string, { count: number; until: number }>();
  private window = { count: 0, until: 0 };

  take(address: string) {
    const now = Date.now();
    if (this.window.until <= now) { this.window = { count: 0, until: now + 60000 }; this.buckets.clear(); }
    if (++this.window.count > 120) throw new SupportError('busy', 429);
    const bucket = this.buckets.get(address) || { count: 0, until: this.window.until };
    this.buckets.set(address, bucket);
    if (++bucket.count > 20) throw new SupportError('rateLimited', 429);
  }
}

export function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

export function failure(error: unknown, locale: string = 'zh') {
  const messages = getMessages(isLocale(locale) ? locale : 'zh').supportErrors;
  return json({ ok: false, message: messages[error instanceof SupportError ? error.code : 'unavailable'] },
    error instanceof SupportError ? error.status : 503);
}
