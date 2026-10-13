import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';

test('model directory prioritizes dated official IDs, then dated variants, then undated models while popular mode retains reach ordering', {
  skip: !process.env.CARDNAV_TEST_DATABASE_URL,
}, async () => {
  const originalUrl = process.env.DATABASE_URL;
  const connectionString = process.env.CARDNAV_TEST_DATABASE_URL!;
  const schema = `cardnav_model_order_test_${randomUUID().replaceAll('-', '')}`;
  const db = new pg.Client({ connectionString });
  await db.connect();
  let appPool: pg.Pool | undefined;
  try {
    await db.query(`CREATE SCHEMA ${schema}`);
    await db.query(`CREATE TABLE ${schema}.gateway_model_summaries (
      model_id text, model_provider text, model_family text,
      support_site_count integer, price_count integer, max_site_score numeric,
      latest_price_fetched_at timestamptz, release_date date, is_official_model_id boolean
    )`);
    const fixtures = [
      ['official-old', '2026-01-01', true, 1],
      ['official-new', '2026-02-01', true, 2],
      ['variant-newest', '2026-03-01', false, 3],
      ['variant-older', '2026-01-01', false, 4],
      ['undated-official', null, true, 5],
      ['undated-variant', null, false, 6],
    ];
    for (const [id, date, official, reach] of fixtures) {
      await db.query(`INSERT INTO ${schema}.gateway_model_summaries VALUES ($1,'Example',NULL,$2,1,10,now(),$3,$4)`, [id, reach, date, official]);
    }
    const url = new URL(connectionString);
    url.searchParams.set('options', `-c search_path=${schema}`);
    process.env.DATABASE_URL = url.toString();
    const { getPool, loadGatewayModels } = await import('../src/store.js');
    appPool = getPool();
    assert.deepEqual((await loadGatewayModels()).models.map(model => model.modelId), [
      'official-new', 'official-old', 'variant-newest', 'variant-older', 'undated-variant', 'undated-official',
    ]);
    assert.deepEqual((await loadGatewayModels({ limit: 2 })).models.map(model => model.modelId), ['official-new', 'official-old']);
    assert.deepEqual((await loadGatewayModels({ sort: 'popular' })).models.map(model => model.modelId), [
      'undated-variant', 'undated-official', 'variant-older', 'variant-newest', 'official-new', 'official-old',
    ]);
  } finally {
    if (originalUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalUrl;
    await appPool?.end();
    await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await db.end();
  }
});
