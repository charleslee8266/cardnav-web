/**
 * 文件说明: 验证合作、赞赏积分及收藏在商品列表中的排序优先级。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { prioritizeShopProductRows, type ShopPinnedRow } from '../src/shop-sponsored-pinning.js';
function row(key: string, sponsor = false, supportPoints = 0): ShopPinnedRow {
  return { id: key, productFavoriteKey: key, siteFavoriteKey: key, score: 0, sponsor, supportPoints };
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
  assert.deepEqual(sorted.map(item => item.productFavoriteKey), ['partner-0', 'partner-1', 'partner-10', 'partner-11', 'partner-2', 'partner-3', 'partner-4', 'partner-5', 'partner-6', 'partner-7', 'favorite', 'ordinary', 'low', 'high', 'partner-8', 'partner-9']);
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
  assert.deepEqual(sorted.slice(0, 4).map(item => item.productFavoriteKey), ['ordinary-0', 'ordinary-1', 'ordinary-10', 'normal']);
  assert.deepEqual(sorted.slice(4).map(item => item.productFavoriteKey), ordinary.filter(item => !['ordinary-0','ordinary-1','ordinary-10'].includes(item.id)).map(item => item.productFavoriteKey));
  assert.equal(sorted.length, 13);
});

test('收藏商家总数不限，逐件收藏商品与商家入选商品同分时按ID排列', () => {
  const merchants = Array.from({ length: 3 }, (_, site) => Array.from({ length: 6 }, (_, index) => ({
    ...row(`merchant-${site}-${index}`), siteFavoriteKey: `site-${site}`,
  }))).flat();
  const individuallyFavorited = Array.from({ length: 12 }, (_, index) => row(`favorite-${index}`));
  const sorted = prioritizeShopProductRows([row('normal'), ...merchants, ...individuallyFavorited], {
    favoriteProductKeys: new Set(individuallyFavorited.map(item => item.productFavoriteKey)),
    favoriteSiteKeys: new Set(['site-0', 'site-1', 'site-2']),
  });
  assert.deepEqual(sorted.slice(0, 21), [...[0,1,10,11,2,3,4,5,6,7,8,9].map(index => individuallyFavorited[index]), ...merchants.filter((_, index) => index % 6 < 3)]);
  assert.equal(sorted[21].productFavoriteKey, 'normal');
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
    const kinds = new Map<ShopPinnedRow, string>();
    const sorted = prioritizeShopProductRows(rows, {
      favoriteProductKeys: new Set([`${kind}-0-3`]),
      favoriteSiteKeys: new Set(),
    }, (item, kind) => kinds.set(item, kind));
    const expectedPins = merchants.filter((_, index) => index % 4 === 0 || (index % 4 === 1 && index < 16));
    assert.deepEqual(sorted.slice(0, 10), expectedPins);
    for (const item of expectedPins) assert.equal(kinds.get(item), kind);
    assert.equal(kinds.get(merchants[3]), 'favorite');
    assert.equal(kinds.get(merchants[2]), '');
    assert.equal(kinds.get(merchants[21]), '');
    assert.equal(sorted[10].productFavoriteKey, `${kind}-0-3`);
    assert.equal(sorted[11].productFavoriteKey, 'normal');
    assert.equal(new Set(sorted).size, rows.length);
    const pins = new Set([...expectedPins, merchants[3]]);
    assert.deepEqual(sorted.slice(12), merchants.filter(item => !pins.has(item)));
  });
}


test('收藏商家各选评分最高的三件，与单独收藏商品合并按评分排序并保留超额记录', () => {
  const a = Array.from({ length: 6 }, (_, index) => ({ ...row(`a-${index}`), siteFavoriteKey: 'a', score: 100 - index }));
  const b = Array.from({ length: 6 }, (_, index) => ({ ...row(`b-${index}`), siteFavoriteKey: 'b', score: 80 - index }));
  const individual = { ...row('individual'), score: 90 };
  const normal = { ...row('normal'), score: 110 };
  const rows = [normal, b[5], ...a, individual, ...b.slice(0, 5)];
  const sorted = prioritizeShopProductRows(rows, {
    favoriteProductKeys: new Set(['individual', 'a-0', 'a-5']),
    favoriteSiteKeys: new Set(['a', 'b']),
  });
  assert.deepEqual(sorted, [...a.slice(0, 3), a[5], individual, ...b.slice(0, 3), normal, b[5], ...a.slice(3, 5), ...b.slice(3, 5)]);
  assert.equal(new Set(sorted).size, rows.length);
});

test('手动排序每商家选当前前两件，收藏保持普通排序', () => {
  const input = [
    { ...row('ordinary'), price: 0 },
    { ...row('support-cheap', false, 5), siteFavoriteKey: 'support', price: 1 },
    { ...row('support-next', false, 5), siteFavoriteKey: 'support', price: 2 },
    { ...row('favorite'), price: 3 },
    { ...row('partner-cheap', true, 1), siteFavoriteKey: 'partner', price: 4 },
    { ...row('partner-next', true, 1), siteFavoriteKey: 'partner', price: 5 },
  ];
  const kinds = new Map<string, string>();
  const output = prioritizeShopProductRows(input, {
    favoriteProductKeys: new Set(['favorite']), favoriteSiteKeys: new Set(['support']),
  }, (row, kind) => kinds.set(row.productFavoriteKey, kind), true);
  assert.deepEqual(output.map(row => row.productFavoriteKey), ['partner-cheap', 'partner-next', 'support-cheap', 'support-next', 'ordinary', 'favorite']);
  assert.deepEqual(output.map(row => kinds.get(row.productFavoriteKey)), ['partner', 'partner', 'support', 'support', '', '']);
});
