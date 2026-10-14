/**
 * 文件说明: 验证 Gateway 价格展示保留原始币种与计费单位。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { displayPriceUnit as localizedPriceUnit, priceComparisonKey, matchesPriceUnit, comparePriceUnits } from '../src/gateway-display.js';
import { zhMessages } from '../src/i18n/zh.js';
import { enMessages } from '../src/i18n/en.js';
import { ruMessages } from '../src/i18n/ru.js';
import pg from 'pg';

const displayPriceUnit = (unit: string, currency?: string) => localizedPriceUnit(unit, currency, zhMessages.llmGateway);
import { loadGatewayDetail, loadGatewayModelDetail } from '../src/store.js';

test('labels currency-specific token and media rates without assuming dollars', () => {
  assert.equal(displayPriceUnit('1M_tokens', 'CNY'), 'CNY / 1M tokens');
  assert.equal(displayPriceUnit('1M_tokens', 'USD'), 'USD / 1M tokens');
  assert.equal(displayPriceUnit('second (video: 720p)', 'CNY'), 'CNY / second (video: 720p)');
  assert.equal(displayPriceUnit('quota_ratio'), '倍率');
  assert.equal(displayPriceUnit('1M_tokens', '$'), displayPriceUnit('1M_tokens', 'USD'));
  assert.equal(displayPriceUnit('1M_tokens'), '— / 1M tokens');
  assert.notEqual(priceComparisonKey({unit: '1M_tokens', currency: 'USD'}), priceComparisonKey({unit: '1M_tokens', currency: 'CNY'}));
  assert.equal(displayPriceUnit('call'), '按次');
  assert.equal(displayPriceUnit('call (image: 1K)', 'CNY'), 'CNY · 按次 (image: 1K)');
  assert.equal(localizedPriceUnit('call', 'USD', enMessages.llmGateway), 'USD · Per call');
  assert.equal(localizedPriceUnit('request', 'USD', ruMessages.llmGateway), 'USD · За вызов');
});

test('default unit filter retains all quotes and explicit filters preserve currency boundaries', () => {
  const prices = [
    { unit: '1M_tokens', currency: '$', inputPrice: 20 },
    { unit: '1M_tokens', currency: 'USD', inputPrice: 10 },
    { unit: '1M_tokens', currency: 'CNY', inputPrice: 1 },
    { unit: 'quota_ratio', currency: '', inputPrice: 0.1 },
  ];
  assert.deepEqual(prices.filter(price => matchesPriceUnit(price, '')), prices);
  const dollars = prices.filter(price => matchesPriceUnit(price, priceComparisonKey(prices[0])));
  assert.deepEqual(dollars, prices.slice(0, 2));
  assert.deepEqual(prices.filter(price => matchesPriceUnit(price, priceComparisonKey(prices[3]))), [prices[3]]);
  const sorted = [...prices].sort((a, b) => comparePriceUnits(a, b) || a.inputPrice - b.inputPrice);
  assert.deepEqual(sorted, [prices[1], prices[0], prices[2], prices[3]]);
});

test('public gateway and model detail reads retain the price currency', async t => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgres://unused:unused@localhost/unused';
  t.after(() => {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });
  t.mock.method(pg.Pool.prototype, 'query', async (sql: string) => {
    if (sql.includes('WITH model_price_summary')) {
      assert.match(sql, /'currency', currency/);
      return { rows: [{ id: 'example', site_name: 'Example', url: 'https://example.test', prices_for_model: [{ groupId: 'standard', groupName: 'Standard', groupDescription: 'Provider original description', unit: '1M_tokens', currency: 'CNY', inputPrice: 2 }] }] };
    }
    if (sql.includes('prices.input_price')) {
      assert.match(sql, /prices.currency/);
      return { rows: [{ model_id: 'gpt-example', group_id: 'standard', group_name: 'Standard', group_description: 'Provider original description', unit: '1M_tokens', currency: 'CNY', input_price: 2 }] };
    }
    if (sql.includes('COUNT(DISTINCT prices.site_id)')) return { rows: [{ model_id: 'gpt-example' }] };
    return { rows: [{ id: 'example', slug: 'example', site_name: 'Example', url: 'https://example.test' }] };
  });
  const gateway = await loadGatewayDetail('example');
  const model = await loadGatewayModelDetail('gpt-example');
  assert.equal(gateway?.prices[0].currency, 'CNY');
  assert.equal(model?.sites[0].pricesForModel[0].currency, 'CNY');
  assert.equal(gateway?.prices[0].groupId, 'standard');
  assert.equal(model?.sites[0].pricesForModel[0].groupDescription, 'Provider original description');
});


test('sites without prices display their current manually declared families', async t => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgres://unused:unused@localhost/unused';
  t.after(() => {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });
  let priceCount = 0;
  t.mock.method(pg.Pool.prototype, 'query', async (sql: string) => {
    if (sql.includes('prices.input_price')) return { rows: [] };
    return { rows: [{ id: 'example', slug: 'example', site_name: 'Example', url: 'https://example.test', price_count: priceCount, model_families: ['Manual family'], recent_model_families: ['Parsed family'] }] };
  });
  assert.deepEqual((await loadGatewayDetail('example'))?.site.displayModelFamilies, ['Manual family']);
  priceCount = 1;
  assert.deepEqual((await loadGatewayDetail('example'))?.site.displayModelFamilies, ['Parsed family']);
});
