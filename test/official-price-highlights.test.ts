import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { buildOfficialPriceGroups } from '../src/official-price.js';
import { localizeOfficialPriceGroups } from '../src/localized-display.js';

// This test exercises the real SQL in a disposable, isolated schema.
test('price overview returns three cheapest regions plus each plan’s U.S. baseline and preserves canonical links', {
  skip: !process.env.CARDNAV_TEST_DATABASE_URL,
}, async () => {
  const originalUrl = process.env.DATABASE_URL;
  const connectionString = process.env.CARDNAV_TEST_DATABASE_URL!;
  const schema = `cardnav_prices_test_${randomUUID().replaceAll('-', '')}`;
  const db = new pg.Client({ connectionString });
  await db.connect();
  let appPool: pg.Pool | undefined;
  try {
    await db.query(`CREATE SCHEMA ${schema}`);
    await db.query(`CREATE TABLE ${schema}.official_prices (
      app_slug text, plan_slug text, app_name text, plan_name text, display_name text,
      url_slug text, is_default boolean, display_order integer,
      country_code text, country_label text, currency_code text,
      price_text text, price_value numeric, cny_price numeric, usd_price numeric,
      rub_price numeric, fetched_at timestamptz
    )`);
    for (const [app, plan, slug, order] of [['chatgpt', 'plus', 'chatgpt-plus', 1], ['claude', 'pro', 'claude-pro', 2]] as const) {
      for (const [country, amount] of [['US', 140], ['TR', 50], ['IN', 60], ['JP', 60], ['GB', 160]] as const) {
        await db.query(`INSERT INTO ${schema}.official_prices VALUES ($1,$2,$1,$2,$1 || ' ' || $2,$3,false,$4,$5,$5,'USD',($6::numeric)::text,$6::numeric,$6::numeric,$6::numeric / 7,$6::numeric * 10,now())`, [app, plan, slug, order, country, amount]);
      }
    }
    const url = new URL(connectionString);
    url.searchParams.set('options', `-c search_path=${schema}`);
    process.env.DATABASE_URL = url.toString();
    const { getPool, loadOfficialPriceHighlights } = await import('../src/store.js');
    appPool = getPool();
    const rows = await loadOfficialPriceHighlights();
    assert.equal(rows.length, 8);
    const groups = buildOfficialPriceGroups(rows);
    assert.deepEqual(groups.map(group => group.pathname), ['/official-price/gpt-plus', '/official-price/claude-pro']);
    for (const group of groups) {
      assert.deepEqual(group.prices.map(price => price.countryCode), ['TR', 'IN', 'JP', 'US']);
      assert.deepEqual(group.prices.map(price => price.cnyPrice), [50, 60, 60, 140]);
    }
    const english = localizeOfficialPriceGroups(groups, 'en');
    assert.equal(english[0].prices[0].equivalentCurrencyCode, 'USD');
    assert.equal(english[0].prices[0].equivalentPrice, 50 / 7);
    await db.query(`TRUNCATE ${schema}.official_prices`);
    assert.deepEqual(await loadOfficialPriceHighlights(), []);
  } finally {
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
    await appPool?.end();
    await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await db.end();
  }
});
