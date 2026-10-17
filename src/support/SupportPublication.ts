/**
 * 文件说明: 到账后定向清理 Cloudflare 缓存；失败由持久订单状态支持重试。
 * 参考资料: Cloudflare Purge Cached Content API 与 Purge cache by prefix 文档。
 */
import { supportedLocales } from '../i18n/config.js';
import { localizePath } from '../i18n/paths.js';
import type { SupportKind } from './EasyPay.js';

type PublicationInput = { kind: SupportKind; siteId: string | null };

export class SupportPublication {
  private readonly origin: URL;
  private readonly zone: string;
  private readonly token: string;

  constructor() {
    this.zone = process.env.CLOUDFLARE_ZONE_ID?.trim() || '';
    this.token = process.env.CLOUDFLARE_API_TOKEN?.trim() || '';
    try {
      this.origin = new URL(process.env.PUBLIC_SITE_URL || '');
      if (this.origin.protocol !== 'https:' || this.origin.username || this.origin.password
        || this.origin.pathname !== '/' || this.origin.search || this.origin.hash
        || !/^[a-f0-9]{32}$/i.test(this.zone) || !this.token) throw new Error();
    } catch { throw new Error('Support publication requires valid Cloudflare purge configuration'); }
  }

  private prefixes(kind: SupportKind) {
    const paths = ['/supporters'];
    if (kind === 'shop') paths.push('/market');
    if (kind === 'gateway') paths.push('/llm-gateway');
    const prefixes = supportedLocales.flatMap(locale => paths.map(path => `${this.origin.host}${localizePath(path, locale)}`));
    if (kind === 'shop') prefixes.push(`${this.origin.host}/api/shop-products.json`);
    if (kind === 'gateway') prefixes.push(`${this.origin.host}/api/llm-gateway/`);
    return prefixes;
  }

  async publish(input: PublicationInput) {
    await this.purge({ prefixes: this.prefixes(input.kind) });
    if (input.kind !== 'person') {
      const files = supportedLocales.flatMap(locale => {
        const path = localizePath('/', locale);
        const url = `${this.origin.origin}${path}`;
        return path === '/' ? [url] : [url, `${url}/`];
      });
      await this.purge({ files });
    }
  }

  private async purge(target: { prefixes: string[] } | { files: string[] }) {
    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${this.zone}/purge_cache`, {
      method: 'POST', headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(target),
      redirect: 'error', signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('Support cache purge failed');
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || !('success' in body) || body.success !== true) {
      throw new Error('Support cache purge was not confirmed');
    }
  }
}

export async function publishSupport(input: PublicationInput) {
  await new SupportPublication().publish(input);
}
