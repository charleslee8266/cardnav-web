/**
 * 文件说明: 验证合作、赞赏积分及收藏在商品列表中的排序优先级。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { prioritizeShopProductRows, type ShopPinnedRow } from '../src/shop-sponsored-pinning.js';
function row(key: string, sponsor = false, supportPoints = 0): ShopPinnedRow {
  return { productFavoriteKey: key, siteFavoriteKey: key, sponsor, supportPoints };
}

test('高积分商家在原评分顺序末尾也能获得两件置顶，余下商品回到原位置', () => {
  const ordinary = row('ordinary');
  const low = Array.from({ length: 3 }, (_, index) => ({ ...row(`low-${index}`, true, 0), siteFavoriteKey: 'low' }));
  const high = Array.from({ length: 3 }, (_, index) => ({ ...row(`high-${index}`, true, 100), siteFavoriteKey: 'high' }));
  const sorted = prioritizeShopProductRows([ordinary, ...low, ...high], { favoriteProductKeys: new Set(), favoriteSiteKeys: new Set() });
  assert.deepEqual(sorted.map(item => item.productFavoriteKey), ['high-0', 'high-1', 'low-0', 'low-1', 'ordinary', 'low-2', 'high-2']);
});

test('商品累计赞赏不代替已归零的赞赏积分', () => {
  const ordinary = { ...row('ordinary'), supportTotalCents: 10000 };
  const supporter = row('supporter', false, 1);
  const sorted = prioritizeShopProductRows([ordinary, supporter], { favoriteProductKeys: new Set(), favoriteSiteKeys: new Set() });
  assert.deepEqual(sorted.map(item => item.productFavoriteKey), ['supporter', 'ordinary']);
});

test('合作组积分相同时沿用商品评分顺序', () => {
  const rows = [row('higher-score', true, 20), row('lower-score', true, 20), row('higher-points', true, 30)];
  const sorted = prioritizeShopProductRows(rows, { favoriteProductKeys: new Set(), favoriteSiteKeys: new Set() });
  assert.deepEqual(sorted.map(item => item.productFavoriteKey), ['higher-points', 'higher-score', 'lower-score']);
});
test('partner pins precede support and favorites while overflow keeps its place', () => {
  const partners = Array.from({ length: 12 }, (_, i) => row(`partner-${i}`, true));
  const rows = [row('ordinary'), row('low', false, 100), row('favorite'), row('high', false, 50000), ...partners];
  const sorted = prioritizeShopProductRows(rows, { favoriteProductKeys: new Set(['favorite']), favoriteSiteKeys: new Set() });
  assert.deepEqual(sorted.map(item => item.productFavoriteKey), [...partners.slice(0, 10).map(item => item.productFavoriteKey), 'high', 'low', 'favorite', 'ordinary', 'partner-10', 'partner-11']);
  assert.equal(new Set(sorted).size, rows.length);
});
test('partners and supported merchants sort by support points and preserve ties', () => {
  const rows = [row('first', false, 100), row('favorite', false, 300), row('partner', true, 0), row('partner-high', true, 900)];
  const sorted = prioritizeShopProductRows(rows, { favoriteProductKeys: new Set(['favorite', 'partner']), favoriteSiteKeys: new Set(['first']) });
  assert.deepEqual(sorted.map(item => item.productFavoriteKey), ['partner-high', 'partner', 'favorite', 'first']);
});
test('ordinary merchant favorites keep their bounded allocation', () => {
  const ordinary = Array.from({ length: 12 }, (_, i) => ({ ...row(`ordinary-${i}`), siteFavoriteKey: 'favorite-site' }));
  const sorted = prioritizeShopProductRows([row('normal'), ...ordinary], { favoriteProductKeys: new Set(), favoriteSiteKeys: new Set(['favorite-site']) });
  assert.deepEqual(sorted.slice(0, 6).map(item => item.productFavoriteKey), ['ordinary-0', 'ordinary-1', 'ordinary-2', 'ordinary-3', 'ordinary-4', 'normal']);
  assert.deepEqual(sorted.slice(6).map(item => item.productFavoriteKey), ordinary.slice(5).map(item => item.productFavoriteKey));
  assert.equal(sorted.length, 13);
});

test('收藏商家总数不限，逐件收藏的商品全部提前', () => {
  const merchants = Array.from({ length: 3 }, (_, site) => Array.from({ length: 6 }, (_, index) => ({
    ...row(`merchant-${site}-${index}`), siteFavoriteKey: `site-${site}`,
  }))).flat();
  const individuallyFavorited = Array.from({ length: 12 }, (_, index) => row(`favorite-${index}`));
  const sorted = prioritizeShopProductRows([row('normal'), ...merchants, ...individuallyFavorited], {
    favoriteProductKeys: new Set(individuallyFavorited.map(item => item.productFavoriteKey)),
    favoriteSiteKeys: new Set(['site-0', 'site-1', 'site-2']),
  });
  assert.deepEqual(sorted.slice(0, 12), individuallyFavorited);
  assert.equal(sorted.slice(12, 27).filter(item => item.siteFavoriteKey.startsWith('site-')).length, 15);
  assert.equal(sorted[27].productFavoriteKey, 'normal');
});

for (const [kind, siteLimit] of [['partner', 2], ['support', 2]] as const) {
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
