/** Latest browser favorites, validated independently of the currently loaded page. */
import { getPool } from './store.js';

export const MAX_FAVORITES = 1000;
export const MAX_FAVORITE_BODY_BYTES = 128 * 1024;
export type FavoriteSnapshot = {
  visitorId: string;
  revision: number;
  productIds: string[];
  productKeys: string[];
  siteIds: string[];
};

export function parseFavoriteSnapshot(body: unknown): FavoriteSnapshot | null {
  if (!body || typeof body !== 'object') return null;
  const value = body as Record<string, unknown>;
  if (typeof value.visitorId !== 'string'
    || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value.visitorId)
    || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1) return null;
  function ids(input: unknown, maxLength: number): string[] | null {
    if (!Array.isArray(input) || input.length > MAX_FAVORITES
      || input.some(id => typeof id !== 'string' || !id.length || id.length > maxLength)) return null;
    return [...new Set(input as string[])].sort();
  }
  const productIds = ids(value.productIds, 128);
  const productKeys = ids(value.productKeys ?? [], 1024);
  const siteIds = ids(value.siteIds, 128);
  if (!productIds || !productKeys || !siteIds
    || productIds.length + productKeys.length + siteIds.length > MAX_FAVORITES) return null;
  return { visitorId: value.visitorId, revision: Number(value.revision), productIds, productKeys, siteIds };
}

export async function saveFavoriteSnapshot(input: FavoriteSnapshot): Promise<void> {
  // Resolve legacy browser keys against the full catalog. Ambiguous names are not resolved.
  // One statement keeps validation and replacement atomic even when requests arrive out of order.
  await getPool().query(`
    WITH legacy_products AS (
      SELECT min(product.id) AS id
      FROM shop_products product JOIN shop_sites site ON site.id = product.site_id
      WHERE (site.name || '#' || product.name) = ANY($4::text[]) AND site.type = 'cardShop'
      GROUP BY site.name || '#' || product.name HAVING count(*) = 1
    ), products AS (
      SELECT product.id FROM shop_products product JOIN shop_sites site ON site.id = product.site_id
      WHERE product.id = ANY($3::text[]) AND site.type = 'cardShop'
      UNION SELECT id FROM legacy_products
    ), sites AS (
      SELECT id FROM shop_sites WHERE id = ANY($5::text[]) AND type = 'cardShop'
    )
    INSERT INTO shop_favorite_snapshots (visitor_id, revision, product_ids, site_ids, synced_at)
    SELECT $1::uuid, $2::bigint,
      ARRAY(SELECT id FROM products ORDER BY id), ARRAY(SELECT id FROM sites ORDER BY id), now()
    WHERE EXISTS (SELECT 1 FROM products) OR EXISTS (SELECT 1 FROM sites)
       OR EXISTS (SELECT 1 FROM shop_favorite_snapshots WHERE visitor_id = $1::uuid)
    ON CONFLICT (visitor_id) DO UPDATE SET
      revision = EXCLUDED.revision, product_ids = EXCLUDED.product_ids,
      site_ids = EXCLUDED.site_ids, synced_at = EXCLUDED.synced_at
    WHERE shop_favorite_snapshots.revision < EXCLUDED.revision
       OR (shop_favorite_snapshots.revision = EXCLUDED.revision
           AND shop_favorite_snapshots.product_ids = EXCLUDED.product_ids
           AND shop_favorite_snapshots.site_ids = EXCLUDED.site_ids)
  `, [input.visitorId, input.revision, input.productIds, input.productKeys, input.siteIds]);
}
