/** Public merchant profiles and their catalog; only published shops are exposed. */
import { getPool, loadShopProductsData, type PublicSiteRow } from './store.js';
import { shopPlatformName } from './shop-platform.js';

export async function loadPublicShops(): Promise<PublicSiteRow[]> {
  const result = await getPool().query(`
    SELECT id, slug, name, url, family, score, sponsor, support_total_cents,
      support_points, last_product_refresh_success_at
    FROM shop_sites
    WHERE status = 'online' AND type = 'cardShop' AND slug <> ''
    ORDER BY id
  `);
  return result.rows.map(row => ({
    id: String(row.id), slug: String(row.slug), name: String(row.name), url: String(row.url),
    platformName: shopPlatformName(row.family), score: Number(row.score) || 0,
    sponsor: row.sponsor === true, supportTotalCents: Number(row.support_total_cents) || 0,
    supportPoints: Number(row.support_points) || 0,
    lastProductRefreshSuccessAt: row.last_product_refresh_success_at
      ? new Date(row.last_product_refresh_success_at).toISOString() : null,
    lastProductRefreshSuccessTime: '',
  }));
}

const storeSoftware: Record<string, string> = {
  'framework-dujiaoka': '独角数卡',
  'framework-dujiaoka-card-grid': '独角数卡',
  'framework-dujiao-next': 'Dujiao-Next',
  'framework-jingsoft': 'Jingsoft',
  'framework-zfaka': 'ZFAKA',
  'framework-orion-key': 'Orion Key',
};

function isoDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export async function loadPublicShopDetail(slug: string) {
  const result = await getPool().query(`
    SELECT id, description, created_at, family, opened_at, platform_joined_months,
      platform_tenure_checked_at, domain_registered_at,
      stock_decrease_30d, stock_decrease_daily
    FROM shop_sites
    WHERE slug = $1 AND status = 'online' AND type = 'cardShop'
  `, [slug]);
  if (!result.rows.length) return null;
  const data = await loadShopProductsData({ siteId: String(result.rows[0].id) });
  const site = data.sites[0];
  if (!site) return null;
  const row = result.rows[0];
  return {
    site, products: data.products, catalogData: data, listedAt: isoDate(row.created_at),
    description: String(row.description || '').trim(),
    stockDecreaseDaily: (row.stock_decrease_daily || []) as { date: string; decrease: number | null }[],
    openedAt: isoDate(row.opened_at),
    platformJoinedMonths: row.platform_joined_months == null ? null : Number(row.platform_joined_months),
    platformTenureCheckedAt: isoDate(row.platform_tenure_checked_at),
    domainRegisteredAt: site.platformName ? null : isoDate(row.domain_registered_at),
    software: storeSoftware[String(row.family)] || '',
    stockDecrease30d: row.stock_decrease_30d == null ? null : Number(row.stock_decrease_30d),
  };
}
