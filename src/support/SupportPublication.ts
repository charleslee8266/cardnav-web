/**
 * 文件说明: 到账后重建相关公开快照并定向清理 Cloudflare 缓存；失败由持久订单状态支持重试。
 * 参考资料: Cloudflare Purge Cached Content API 与 Purge cache by prefix 文档。
 */
import pg from 'pg';
import { supportedLocales } from '../i18n/config.js';
import { localizePath } from '../i18n/paths.js';
import { packShopProductsData } from '../shop-products-data.js';
import { loadGatewaySites, loadShopProductsData } from '../store.js';
import type { SupportKind } from './EasyPay.js';

type PublicationInput = { kind: SupportKind; siteId: string | null };

export class SupportPublication {
  private readonly origin: URL;
  private readonly zone: string;
  private readonly token: string;

  constructor(private readonly pool: pg.Pool) {
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
    if (kind === 'shop') paths.push('/shops');
    if (kind === 'gateway') paths.push('/llm-gateway');
    const prefixes = supportedLocales.flatMap(locale => paths.map(path => `${this.origin.host}${localizePath(path, locale)}`));
    if (kind === 'shop') prefixes.push(`${this.origin.host}/api/shop-products.json`);
    if (kind === 'gateway') prefixes.push(`${this.origin.host}/api/llm-gateway/`);
    return prefixes;
  }

  async publish(input: PublicationInput) {
    if (input.kind !== 'person' && input.siteId !== null) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL statement_timeout = '10s'");
        await client.query('SELECT pg_advisory_xact_lock(73140, 1)');
        const snapshots: { key: string; payload: unknown; sourceRefreshedAt: string | null }[] = [];
        if (input.kind === 'shop') {
          const data = await loadShopProductsData({ queryClient: client, bypassSnapshot: true });
          snapshots.push({ key: 'shop-products', payload: data, sourceRefreshedAt: data.latestRefreshedAt ?? null },
            { key: 'shop-products-packed', payload: packShopProductsData(data), sourceRefreshedAt: data.latestRefreshedAt ?? null });
        } else {
          const data = await loadGatewaySites({ queryClient: client, bypassSnapshot: true });
          snapshots.push({ key: 'gateway-sites', payload: data, sourceRefreshedAt: null });
        }
        for (const snapshot of snapshots) {
          await client.query(`INSERT INTO public_snapshot_entries (key, payload, source_refreshed_at, generated_at, updated_at)
            VALUES ($1, $2::jsonb, $3, now(), now()) ON CONFLICT (key) DO UPDATE SET
            payload = EXCLUDED.payload, source_refreshed_at = EXCLUDED.source_refreshed_at,
            generated_at = EXCLUDED.generated_at, updated_at = now()`,
          [snapshot.key, JSON.stringify(snapshot.payload), snapshot.sourceRefreshedAt]);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    }
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

let pool: pg.Pool | undefined;
export async function publishSupport(input: PublicationInput) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2,
    connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, allowExitOnIdle: true });
  await new SupportPublication(pool).publish(input);
}
