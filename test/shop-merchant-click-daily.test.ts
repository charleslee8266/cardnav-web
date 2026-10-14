/**
 * 文件说明: 验证商品日记录按北京时间累加点击，并与当日库存写入共存。
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';

test('merchant clicks and product metrics accumulate on one Beijing daily row', {
  skip: !process.env.CARDNAV_TEST_DATABASE_URL,
}, async () => {
  const databaseUrl = process.env.CARDNAV_TEST_DATABASE_URL!;
  const schema = `cardnav_click_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: databaseUrl });
  const originalPool = pg.Pool;
  const openedPools: pg.Pool[] = [];
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const productId = '11111111111111111111111111111111';

  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(`
      CREATE TABLE ${schema}.shop_sites (id TEXT PRIMARY KEY, status TEXT NOT NULL, type TEXT NOT NULL);
      CREATE TABLE ${schema}.shop_products (
        id TEXT PRIMARY KEY, site_id TEXT NOT NULL, product_url TEXT,
        category_name TEXT NOT NULL, name TEXT NOT NULL,
        active BOOLEAN NOT NULL DEFAULT true, refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE ${schema}.shop_product_daily (
        product_id TEXT NOT NULL, observed_date DATE NOT NULL, observed_at TIMESTAMPTZ,
        stock INTEGER, in_stock BOOLEAN, price_number DOUBLE PRECISION, price_unit TEXT,
        price_cny DOUBLE PRECISION, clicks INTEGER NOT NULL DEFAULT 0,
        metric_groups JSONB NOT NULL DEFAULT '{}'::jsonb,
        PRIMARY KEY (product_id, observed_date)
      );
      CREATE TABLE ${schema}.shop_product_visitor_events (
        product_id TEXT NOT NULL, observed_date DATE NOT NULL, visitor_id UUID NOT NULL,
        impression_group TEXT, click_group TEXT,
        PRIMARY KEY (product_id, observed_date, visitor_id)
      );
      INSERT INTO ${schema}.shop_sites VALUES ('site-a', 'online', 'cardShop');
      INSERT INTO ${schema}.shop_products (id, site_id, product_url, category_name, name)
      VALUES ('${productId}', 'site-a', 'https://example.com/item', 'AI', 'Item');
    `);
    const testUrl = new URL(databaseUrl);
    testUrl.searchParams.set('options', `-c search_path=${schema}`);
    process.env.DATABASE_URL = testUrl.toString();
    (pg as { Pool: typeof pg.Pool }).Pool = class extends originalPool {
      constructor(config?: pg.PoolConfig) {
        super(config);
        openedPools.push(this);
      }
    };

    const { recordProductClick, recordProductMetric, recordProductMetrics } = await import('../src/store.js');
    const batchMetric = {
      productId, visitorId: '33333333-3333-4333-8333-333333333333',
      eventType: 'impression' as const, scene: 'default' as const,
      displayType: 'normal' as const, positionBucket: '1-5' as const,
    };
    assert.deepEqual(await recordProductMetrics([batchMetric, batchMetric]), { recorded: true });
    assert.deepEqual(await recordProductMetrics([batchMetric]), { recorded: false });
    const batchRows = await admin.query(`SELECT metric_groups FROM ${schema}.shop_product_daily`);
    assert.equal(batchRows.rows[0].metric_groups['default|normal|1-5'].impressions, 1);
    await admin.query(`DELETE FROM ${schema}.shop_product_daily; DELETE FROM ${schema}.shop_product_visitor_events`);
    const click = { siteId: 'site-a', productUrl: 'https://example.com/item', visitorId: '11111111-1111-4111-8111-111111111111' };
    assert.deepEqual(await recordProductClick(click), { recorded: true });
    assert.deepEqual(await recordProductClick(click), { recorded: false });
    assert.deepEqual(await recordProductMetric({
      productId, visitorId: '22222222-2222-4222-8222-222222222222', eventType: 'impression', scene: 'default',
      displayType: 'normal', positionBucket: '1-5',
    }), { recorded: true });
    assert.deepEqual(await recordProductMetric({
      productId, visitorId: '22222222-2222-4222-8222-222222222222', eventType: 'click', scene: 'default',
      displayType: 'normal', positionBucket: '1-5',
    }), { recorded: true });
    assert.deepEqual(await recordProductMetric({
      productId, visitorId: '33333333-3333-4333-8333-333333333333', eventType: 'click', scene: 'default',
      displayType: 'normal', positionBucket: '1-5',
    }), { recorded: true });
    assert.deepEqual(await recordProductMetric({
      productId, visitorId: '33333333-3333-4333-8333-333333333333', eventType: 'impression', scene: 'default',
      displayType: 'normal', positionBucket: '1-5',
    }), { recorded: false });
    const crossGroupVisitor = '44444444-4444-4444-8444-444444444444';
    assert.deepEqual(await recordProductMetric({
      productId, visitorId: crossGroupVisitor, eventType: 'impression', scene: 'default',
      displayType: 'normal', positionBucket: '1-5',
    }), { recorded: true });
    const crossGroupClick = {
      productId, visitorId: crossGroupVisitor, eventType: 'click' as const, scene: 'search' as const,
      displayType: 'partner' as const, positionBucket: '6-20' as const,
    };
    assert.deepEqual(await recordProductMetric(crossGroupClick), { recorded: true });
    assert.deepEqual(await recordProductMetric(crossGroupClick), { recorded: false });
    const daily = await admin.query(`SELECT clicks, stock, in_stock, metric_groups,
      observed_date = (now() AT TIME ZONE 'Asia/Shanghai')::date AS beijing_date
      FROM ${schema}.shop_product_daily`);
    assert.equal(daily.rows.length, 1);
    assert.equal(daily.rows[0].clicks, 4);
    assert.equal(daily.rows[0].stock, null);
    assert.equal(daily.rows[0].in_stock, null);
    assert.equal(daily.rows[0].beijing_date, true);
    assert.deepEqual(daily.rows[0].metric_groups['default|normal|1-5'], { impressions: 3, clicks: 2 });
    assert.deepEqual(daily.rows[0].metric_groups['search|partner|6-20'], { impressions: 1, clicks: 1 });
    assert.deepEqual(daily.rows[0].metric_groups['merchant|merchant|unknown'], { impressions: 1, clicks: 1 });

    await admin.query(`UPDATE ${schema}.shop_products SET active = false WHERE id = $1`, [productId]);
    assert.deepEqual(await recordProductClick(click), { recorded: false });
    const unchanged = await admin.query(`SELECT clicks FROM ${schema}.shop_product_daily`);
    assert.equal(unchanged.rows[0].clicks, 4);
  } finally {
    (pg as { Pool: typeof pg.Pool }).Pool = originalPool;
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    await Promise.all(openedPools.map(pool => pool.end()));
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
