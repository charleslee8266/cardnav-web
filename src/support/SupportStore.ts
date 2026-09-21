/**
 * 文件说明: 管理公开赞赏订单，使用事务与订单锁保证到账累计只执行一次。
 */
import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';
import { SupportError, type SupportKind, type PaidNotification, type PaymentType } from './EasyPay.js';

export type Supporter = {
  kind: SupportKind;
  name: string;
  url: string | null;
  amountCents: number;
  supportPoints: number;
  message: string;
};

type CreateSupport = {
  kind: SupportKind;
  siteId: string | null;
  nickname?: string;
  email?: string;
  message?: string;
  amountCents: number;
  pid: string;
  paymentType: PaymentType;
};

export class SupportStore {
  constructor(private readonly pool: pg.Pool) {}

  async sites(kind: Exclude<SupportKind, 'person'>) {
    const table = kind === 'shop' ? 'shop_sites' : 'gateway_sites';
    const id = kind === 'shop' ? 'id' : 'site_id';
    const type = kind === 'shop' ? 'cardShop' : 'gateway';
    const result = await this.pool.query<{ id: string; name: string; url: string }>(`
      SELECT ${id} AS id, COALESCE(NULLIF(name, ''), url) AS name, url FROM ${table}
      WHERE status = 'online' AND type = $1 AND ${id} IS NOT NULL
      ORDER BY sponsor DESC, support_points DESC, name ASC, ${id} ASC
    `, [type]);
    return result.rows;
  }

  async create(input: CreateSupport) {
    const nickname = (input.nickname || '').trim();
    const email = (input.email || '').trim().toLowerCase() || null;
    const message = (input.message || '').trim();
    if (!Number.isInteger(input.amountCents) || input.amountCents % 100 !== 0 || input.amountCents < 500 || input.amountCents > 500000) {
      throw new SupportError('invalidAmount');
    }
    if ([...nickname].length > 40 || [...message].length > 120
      || /[\u0000-\u001f\u007f\u2028\u2029]/u.test((input.nickname || '') + (input.message || ''))
      || (email !== null && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)))) {
      throw new SupportError('invalidProfile');
    }
    if (input.kind === 'person' ? input.siteId !== null || email === null : !input.siteId || nickname || email === null) {
      throw new SupportError('identityMismatch');
    }
    const statusToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(statusToken).digest('hex');
    const id = `cn_${randomBytes(16).toString('hex')}`;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      let siteName = '';
      let siteUrl = '';
      if (input.siteId !== null) {
        const table = input.kind === 'shop' ? 'shop_sites' : 'gateway_sites';
        const field = input.kind === 'shop' ? 'id' : 'site_id';
        const type = input.kind === 'shop' ? 'cardShop' : 'gateway';
        const site = await client.query(`SELECT name, url FROM ${table} WHERE ${field} = $1 AND status = 'online' AND type = $2 FOR SHARE`, [input.siteId, type]);
        if (!site.rowCount) throw new SupportError('selectPublicSite');
        siteName = site.rows[0].name?.trim() || site.rows[0].url;
        siteUrl = site.rows[0].url;
      }
      await client.query(`INSERT INTO support_orders
        (id, kind, site_id, amount_cents, merchant_pid, payment_type, nickname, person_email, message, status_token_hash, site_name, site_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [id, input.kind, input.siteId, input.amountCents, input.pid, input.paymentType, nickname, email, message, tokenHash, siteName, siteUrl]);
      await client.query('COMMIT');
      return { id, statusToken };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async credit(notification: PaidNotification) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // 与公开快照生成共用事务锁，阻止旧金额快照在到账后覆盖失效结果。
      await client.query('SELECT pg_advisory_xact_lock(73140, 1)');
      const result = await client.query(`SELECT kind, site_id, amount_cents, merchant_pid, payment_type, status, trade_no, effects_pending
        FROM support_orders WHERE id = $1 FOR UPDATE`, [notification.orderId]);
      const order = result.rows[0];
      if (!order || order.amount_cents !== notification.amountCents || order.merchant_pid !== notification.pid
        || order.payment_type !== notification.paymentType
        || (order.status === 'paid' && order.trade_no !== notification.tradeNo)) {
        throw new SupportError('notificationMismatch');
      }
      if (order.status !== 'paid') {
        await client.query(`UPDATE support_orders SET status = 'paid', trade_no = $2, paid_at = now(), effects_pending = true WHERE id = $1`, [notification.orderId, notification.tradeNo]);
        if (order.site_id !== null) {
          const table = order.kind === 'shop' ? 'shop_sites' : 'gateway_sites';
          const field = order.kind === 'shop' ? 'id' : 'site_id';
          const credited = await client.query(`UPDATE ${table} SET support_total_cents = support_total_cents + $2 WHERE ${field} = $1`, [order.site_id, order.amount_cents]);
          if (credited.rowCount !== 1) throw new SupportError('siteUnavailable', 503);
          const keys = order.kind === 'shop' ? ['shop-products', 'shop-products-packed'] : ['gateway-sites'];
          await client.query('DELETE FROM public_snapshot_entries WHERE key = ANY($1::text[])', [keys]);
        }
      }
      await client.query('COMMIT');
      return { orderId: notification.orderId, kind: order.kind as SupportKind, siteId: order.site_id as string | null,
        effectsPending: order.status !== 'paid' || order.effects_pending === true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
  async markPublished(orderId: string) {
    await this.pool.query("UPDATE support_orders SET effects_pending = false WHERE id = $1 AND status = 'paid'", [orderId]);
  }

  async status(token: string): Promise<'pending' | 'paid' | null> {
    if (!/^[0-9a-f]{64}$/.test(token)) return null;
    const hash = createHash('sha256').update(token).digest('hex');
    const result = await this.pool.query<{ status: 'pending' | 'paid' }>('SELECT status FROM support_orders WHERE status_token_hash = $1', [hash]);
    return result.rows[0]?.status || null;
  }

  async leaderboard(): Promise<Supporter[]> {
    const result = await this.pool.query(`
      WITH paid AS (
        SELECT id, kind, site_id, site_name, site_url, nickname, message, amount_cents, created_at, CASE WHEN kind = 'person'
          THEN COALESCE('email:' || person_email, 'order:' || id) ELSE site_id END AS identity_key
        FROM support_orders WHERE status = 'paid'
      ), supporters AS (
        SELECT DISTINCT ON (kind, identity_key)
          kind, site_id, site_name, site_url, nickname, message,
          SUM(amount_cents) OVER (PARTITION BY kind, identity_key) AS amount_cents,
          created_at, id
        FROM paid ORDER BY kind, identity_key, created_at DESC, id DESC
      )
      SELECT supporters.kind,
        CASE WHEN supporters.kind = 'person' THEN supporters.nickname
          WHEN supporters.kind = 'shop' THEN COALESCE(NULLIF(shops.name, ''), NULLIF(supporters.site_name, ''), supporters.site_url)
          ELSE COALESCE(NULLIF(gateways.name, ''), NULLIF(supporters.site_name, ''), supporters.site_url) END AS name,
        CASE WHEN supporters.kind = 'shop' THEN shops.url
          WHEN supporters.kind = 'gateway' THEN COALESCE(NULLIF(btrim(gateways.invite_url), ''), gateways.url) END AS url,
        supporters.amount_cents, supporters.message,
        CASE WHEN supporters.kind = 'shop' THEN COALESCE(shops.support_points, 0)
          WHEN supporters.kind = 'gateway' THEN COALESCE(gateways.support_points, 0)
          ELSE 0 END AS support_points
      FROM supporters
      LEFT JOIN shop_sites AS shops ON supporters.kind = 'shop' AND supporters.site_id = shops.id
        AND shops.status = 'online' AND shops.type = 'cardShop'
      LEFT JOIN gateway_sites AS gateways ON supporters.kind = 'gateway' AND supporters.site_id = gateways.site_id
        AND gateways.status = 'online' AND gateways.type = 'gateway'
      ORDER BY supporters.amount_cents DESC, supporters.created_at DESC, supporters.id DESC
    `);
    return result.rows.map(row => {
      let url: string | null = null;
      if (typeof row.url === 'string') {
        try {
          const parsed = new URL(row.url);
          if (['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password) url = parsed.href;
        } catch { /* 无效站点链接只展示名称。 */ }
      }
      return { kind: row.kind, name: row.name, url, amountCents: Number(row.amount_cents), supportPoints: Number(row.support_points) || 0, message: row.message };
    });
  }
}

export async function loadSupportLeaderboard() {
  return getSupportStore().leaderboard();
}

let store: SupportStore | undefined;
export function getSupportStore() {
  if (!store) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    store = new SupportStore(new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4,
      connectionTimeoutMillis: 5000, statement_timeout: 10000, idleTimeoutMillis: 30000, allowExitOnIdle: true }));
  }
  return store;
}
