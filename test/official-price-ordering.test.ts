/** 文件说明: 验证官方订阅按实际地区覆盖后置仅中国区 App，保留原有顺序。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOfficialPriceGroups, buildOfficialPriceGroupsForActiveSlug, buildOfficialPriceProductGroups } from '../src/official-price.js';
import type { PublicOfficialPriceRow } from '../src/store.js';

function price(appSlug: string, displayOrder: number, countryCodes: string[], countryCode = countryCodes[0]): PublicOfficialPriceRow {
  return {
    appSlug, planSlug: 'monthly', appName: appSlug, planName: 'Monthly', displayName: `${appSlug} Monthly`,
    urlSlug: `${appSlug}-monthly`, isDefault: false, displayOrder, countryCode, countryCodes,
    countryLabel: countryCode, currencyCode: 'CNY', priceText: '10', priceValue: 10,
    cnyPrice: 10, usdPrice: 1, rubPrice: 100, fetchedAt: '2026-10-28T00:00:00Z',
  };
}

test('China-only apps follow apps with actual overseas prices without replacing existing ordering', () => {
  const groups = buildOfficialPriceGroups([
    price('chatgpt', 1, ['CN']), price('kimi', 3, ['CN']),
    price('hailuo', 2, ['CN', 'JP'], 'CN'), price('kling-global', 4, ['US', 'JP']),
  ]);
  assert.deepEqual(groups.map(group => group.appSlug), ['hailuo', 'kling-global', 'chatgpt', 'kimi']);
  assert.deepEqual(buildOfficialPriceProductGroups(groups).map(group => group.id), ['hailuo', 'kling-global', 'chatgpt', 'kimi']);
});

test('detail navigation uses all recorded coverage even when only the current plan has prices', () => {
  const rows = [price('chatgpt', 1, ['CN']), price('hailuo', 2, ['CN', 'JP'])];
  const catalog = rows.map(({ countryCode, countryLabel, currencyCode, priceText, priceValue, cnyPrice, usdPrice, rubPrice, fetchedAt, ...entry }) => entry);
  const groups = buildOfficialPriceGroupsForActiveSlug(catalog, [rows[0]], rows[0].urlSlug);
  assert.deepEqual(groups.map(group => group.appSlug), ['hailuo', 'chatgpt']);
  assert.deepEqual(buildOfficialPriceProductGroups(groups).map(group => group.id), ['hailuo', 'chatgpt']);
});

test('an app gains overseas priority when any of its published plans records a non-China region', () => {
  const cnPlan = price('hailuo', 2, ['CN']);
  const overseasPlan = { ...price('hailuo', 3, ['US']), planSlug: 'premium', urlSlug: 'hailuo-premium' };
  const groups = buildOfficialPriceGroups([price('chatgpt', 1, ['CN']), cnPlan, overseasPlan]);
  assert.deepEqual(groups.map(group => group.urlSlug), ['hailuo-monthly', 'hailuo-premium', 'chatgpt-monthly']);
});
