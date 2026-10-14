import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { getPool } from '../src/store.js';
import { saveFavoriteSnapshot, type FavoriteSnapshot } from '../src/shop-favorites.js';

const connectionString = process.env.FAVORITE_TEST_DATABASE_URL;

test('snapshot replacement is ordered, idempotent, validated and supports clearing', { skip: !connectionString }, async () => {
  const schema = `favorite_test_${randomBytes(8).toString('hex')}`;
  const admin = new pg.Pool({ connectionString });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(connectionString!);
  url.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.href;
  const pool = getPool();
  try {
    await pool.query(`
      CREATE TABLE shop_sites (id text PRIMARY KEY, name text, type text);
      CREATE TABLE shop_products (id text PRIMARY KEY, site_id text, name text);
      CREATE TABLE shop_favorite_snapshots (
        visitor_id uuid PRIMARY KEY, revision bigint NOT NULL,
        product_ids text[] NOT NULL, site_ids text[] NOT NULL, synced_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO shop_sites VALUES ('s1', 'Shop', 'cardShop'), ('s2', 'Shop', 'cardShop');
      INSERT INTO shop_products VALUES ('p1', 's1', 'Unique'), ('p2', 's1', 'Shared'), ('p3', 's2', 'Shared');
    `);
    const snapshot: FavoriteSnapshot = {
      visitorId: '01234567-89ab-4cde-8fab-0123456789ab', revision: 1,
      productIds: ['missing'], productKeys: [], siteIds: ['missing'],
    };
    const read = async () => (await pool.query('SELECT revision::text, product_ids, site_ids FROM shop_favorite_snapshots')).rows;
    await saveFavoriteSnapshot(snapshot);
    assert.deepEqual(await read(), [], 'invalid IDs cannot create an empty visitor record');
    snapshot.productKeys = ['Shop#Unique', 'Shop#Shared'];
    snapshot.siteIds = ['s1', 'missing'];
    await saveFavoriteSnapshot(snapshot);
    assert.deepEqual(await read(), [{ revision: '1', product_ids: ['p1'], site_ids: ['s1'] }]);
    await saveFavoriteSnapshot({ ...snapshot, productIds: ['p2'], productKeys: [], siteIds: [] });
    assert.deepEqual((await read())[0].product_ids, ['p1'], 'same revision cannot replace a different payload');
    await saveFavoriteSnapshot(snapshot);
    assert.equal((await read()).length, 1, 'retry remains one snapshot');
    await Promise.all([
      saveFavoriteSnapshot({ ...snapshot, revision: 3, productIds: [], productKeys: [], siteIds: [] }),
      saveFavoriteSnapshot({ ...snapshot, revision: 2 }),
    ]);
    assert.deepEqual(await read(), [{ revision: '3', product_ids: [], site_ids: [] }], 'older request cannot resurrect cleared favorites');
    await saveFavoriteSnapshot({ ...snapshot, revision: 4, productIds: ['p2'], productKeys: [], siteIds: [] });
    assert.deepEqual((await read())[0].product_ids, ['p2'], 'stable ID resolves even with ambiguous names');
    await pool.query('DELETE FROM shop_favorite_snapshots');
    await saveFavoriteSnapshot({ ...snapshot, revision: 5 });
    assert.equal((await read())[0].revision, '5', 'returning browsers can recreate an expired snapshot');
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
