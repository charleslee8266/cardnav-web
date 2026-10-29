import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
test('hero metrics include all regions and deduplicate models across four scenarios beyond the first page', { skip: !process.env.CARDNAV_TEST_DATABASE_URL }, async () => {
  const connectionString = process.env.CARDNAV_TEST_DATABASE_URL!;
  const db = new pg.Client({ connectionString });
  const schema = `cardnav_stats_test_${randomUUID().replaceAll('-', '')}`;
  const previousUrl = process.env.DATABASE_URL;
  let pool: pg.Pool | undefined;
  await db.connect();
  try {
    await db.query(`CREATE SCHEMA ${schema}`);
    await db.query(`CREATE TABLE ${schema}.official_prices (app_slug text, plan_slug text, country_code text, url_slug text, display_name text, app_name text, plan_name text, is_default boolean, display_order integer)`);
    for (const country of ['US', 'IN', 'JP', 'GB', 'CA']) await db.query(`INSERT INTO ${schema}.official_prices (app_slug, plan_slug, country_code, url_slug, display_name) VALUES ('example','plus',$1,'example-plus','Example Plus')`, [country]);
    await db.query(`INSERT INTO ${schema}.official_prices (app_slug, plan_slug, country_code, url_slug, display_name) VALUES ('example','pro','US','example-pro','Example Pro'), ('copilot','legacy','ZZ','legacy','Retired'), ('invalid','empty','XX','','Hidden')`);
    await db.query(`CREATE TABLE ${schema}.model_leaderboards (task_slug text, model_name text)`);
    for (const task of ['coding', 'creative-writing', 'math', 'text-to-image']) {
      for (let index = 0; index < 40; index++) await db.query(`INSERT INTO ${schema}.model_leaderboards VALUES ($1,$2)`, [task, `model-${index}`]);
    }
    await db.query(`INSERT INTO ${schema}.model_leaderboards VALUES ('coding','model-40'), ('math',' model-0 '), ('coding',''), ('unlisted','excluded')`);
    const url = new URL(connectionString); url.searchParams.set('options', `-c search_path=${schema}`); process.env.DATABASE_URL = url.toString();
    const store = await import('../src/store.js'); pool = store.getPool();
    assert.deepEqual(await store.loadOfficialPriceStats(), { productCount: 2, regionCount: 5 });
    assert.deepEqual(await store.loadModelLeaderboardStats(), { scenarioCount: 4, modelCount: 41 });
    await db.query(`TRUNCATE ${schema}.official_prices, ${schema}.model_leaderboards`);
    assert.deepEqual(await store.loadOfficialPriceStats(), { productCount: 0, regionCount: 0 });
    assert.deepEqual(await store.loadModelLeaderboardStats(), { scenarioCount: 0, modelCount: 0 });
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
    await pool?.end(); await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await db.end();
  }
});
