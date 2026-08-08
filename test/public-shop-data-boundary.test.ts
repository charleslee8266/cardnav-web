/**
 * 文件说明: 验证公开 Shop 数据、热门词和点击只使用 online cardShop 记录。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const storeSource = fs.readFileSync(path.resolve('src/store.ts'), 'utf8');

test('public shop reads and interactions require online card shops', () => {
  assert.match(storeSource, /FROM shop_sites\s+WHERE status = 'online'\s+AND type = 'cardShop'/);
  assert.match(storeSource, /INNER JOIN shop_sites ON shop_sites\.id = shop_products\.site_id\s+WHERE shop_sites\.status = 'online'\s+AND shop_sites\.type = 'cardShop'/);
  assert.match(storeSource, /COUNT\(\*\) FILTER \(WHERE status = 'online' AND type = 'cardShop'\)/);
  assert.match(storeSource, /UPDATE shop_products[\s\S]+?shop_sites\.status = 'online'[\s\S]+?shop_sites\.type = 'cardShop'/);
  assert.match(storeSource, /FROM shop_search_terms[\s\S]+?shop_search_terms\.result_count > 0/);
});

test('public gateway sites expose sponsor marker and pin sponsors before score sorting', () => {
  assert.match(storeSource, /gateway_sites\.sponsor/);
  assert.match(storeSource, /ORDER BY gateway_sites\.sponsor DESC, gateway_sites\.score DESC/);
});

test('public gateway detail does not truncate model price rows', () => {
  const detailQuery = storeSource.match(/export async function loadGatewayDetail[\s\S]+?return \{/)?.[0] ?? '';
  assert.doesNotMatch(detailQuery, /LIMIT\s+80\b/);
});
