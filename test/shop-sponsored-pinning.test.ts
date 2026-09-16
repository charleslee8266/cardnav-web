/**
 * 文件说明: 验证合作、累计赞赏及收藏在商品列表中的排序优先级。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { prioritizeShopProductRows, type ShopPinnedRow } from '../src/shop-sponsored-pinning.js';
function row(key: string, sponsor = false, supportTotalCents = 0): ShopPinnedRow {
  return { productFavoriteKey: key, siteFavoriteKey: key, sponsor, supportTotalCents };
}
test('partner pins precede support and favorites while overflow keeps its place', () => {
  const partners = Array.from({ length: 12 }, (_, i) => row(`partner-${i}`, true));
  const rows = [row('ordinary'), row('low', false, 100), row('favorite'), row('high', false, 50000), ...partners];
  const sorted = prioritizeShopProductRows(rows, { favoriteProductKeys: new Set(['favorite']), favoriteSiteKeys: new Set() });
  assert.deepEqual(sorted.map(item => item.productFavoriteKey), [...partners.slice(0, 10).map(item => item.productFavoriteKey), 'low', 'high', 'favorite', 'ordinary', 'partner-10', 'partner-11']);
  assert.equal(new Set(sorted).size, rows.length);
});
test('partners and supportd merchants preserve selected order across amounts and favorites', () => {
  const rows = [row('first', false, 100), row('favorite', false, 300), row('partner', true, 0), row('partner-high', true, 900)];
  const sorted = prioritizeShopProductRows(rows, { favoriteProductKeys: new Set(['favorite', 'partner']), favoriteSiteKeys: new Set(['first']) });
  assert.deepEqual(sorted.map(item => item.productFavoriteKey), ['partner', 'partner-high', 'first', 'favorite']);
});
test('ordinary merchant favorites keep their bounded allocation', () => {
  const ordinary = Array.from({ length: 12 }, (_, i) => ({ ...row(`ordinary-${i}`), siteFavoriteKey: 'favorite-site' }));
  const sorted = prioritizeShopProductRows([row('normal'), ...ordinary], { favoriteProductKeys: new Set(), favoriteSiteKeys: new Set(['favorite-site']) });
  assert.equal(sorted[10].productFavoriteKey, 'normal');
  assert.equal(sorted.length, 13);
});

for (const [kind, siteLimit] of [['partner', 3], ['support', 2]] as const) {
  test(`${kind} pins allow ${siteLimit} products per merchant and ten per group without dropping overflow`, () => {
    const merchants = Array.from({ length: 6 }, (_, siteIndex) =>
      Array.from({ length: 4 }, (_, productIndex) => ({
        ...row(`${kind}-${siteIndex}-${productIndex}`, kind === 'partner', kind === 'support' ? 100 : 0),
        siteFavoriteKey: `site-${siteIndex}`,
      })),
    ).flat();
    const rows = [row('normal'), ...merchants];
    const sorted = prioritizeShopProductRows(rows, {
      favoriteProductKeys: new Set([`${kind}-0-3`]),
      favoriteSiteKeys: new Set(),
    });
    const expectedPins = merchants.filter((_, index) => index % 4 < siteLimit).slice(0, 10);
    assert.deepEqual(sorted.slice(0, 10), expectedPins);
    assert.equal(sorted[10].productFavoriteKey, `${kind}-0-3`);
    assert.equal(sorted[11].productFavoriteKey, 'normal');
    assert.equal(new Set(sorted).size, rows.length);
    const pins = new Set([...expectedPins, merchants[3]]);
    assert.deepEqual(sorted.slice(12), merchants.filter(item => !pins.has(item)));
  });
}
