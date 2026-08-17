/**
 * 文件说明: 验证卡网商品列表的收藏和赞助商家商品置顶规则。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { prioritizeShopProductRows, type ShopPinnedRow } from '../src/shop-sponsored-pinning.js';

type Row = ShopPinnedRow & {
  id: string;
};

function row(site: string, index: number, sponsor = true): Row {
  return {
    id: `${site}-${index}`,
    productFavoriteKey: `${site}-product-${index}`,
    siteFavoriteKey: site,
    sponsor,
  };
}

test('sponsored products are pinned below favorites with total and per-merchant limits', () => {
  const rows = [
    row('sponsor-a', 1),
    row('sponsor-a', 2),
    row('sponsor-a', 3),
    row('sponsor-a', 4),
    row('sponsor-a', 5),
    row('sponsor-a', 6),
    row('normal', 1, false),
  ];

  const sorted = prioritizeShopProductRows(rows, {
    favoriteProductKeys: new Set(['normal-product-1']),
    favoriteSiteKeys: new Set<string>(),
  });

  assert.equal(sorted[0]?.id, 'normal-1');
  assert.deepEqual(sorted.slice(1, 6).map(item => item.id), [
    'sponsor-a-1',
    'sponsor-a-2',
    'sponsor-a-3',
    'sponsor-a-4',
    'sponsor-a-5',
  ]);
  assert.equal(sorted[6]?.id, 'sponsor-a-6');
});

test('sponsored pinning distributes slots across merchants as evenly as possible', () => {
  const rows = Array.from({ length: 10 }).flatMap((_, siteIndex) => [
    row(`sponsor-${siteIndex}`, 1),
    row(`sponsor-${siteIndex}`, 2),
  ]);

  const sorted = prioritizeShopProductRows(rows, {
    favoriteProductKeys: new Set<string>(),
    favoriteSiteKeys: new Set<string>(),
  });

  assert.deepEqual(sorted.slice(0, 10).map(item => item.id), Array.from({ length: 10 }).map((_, siteIndex) => `sponsor-${siteIndex}-1`));
  assert.deepEqual(sorted.slice(10).map(item => item.id), Array.from({ length: 10 }).map((_, siteIndex) => `sponsor-${siteIndex}-2`));
});

test('sponsored pinning keeps favorite merchant products above sponsored products', () => {
  const rows = [
    row('sponsor-a', 1),
    row('favorite-site', 1, false),
    row('sponsor-b', 1),
  ];

  const sorted = prioritizeShopProductRows(rows, {
    favoriteProductKeys: new Set<string>(),
    favoriteSiteKeys: new Set(['favorite-site']),
  });

  assert.deepEqual(sorted.map(item => item.id), ['favorite-site-1', 'sponsor-a-1', 'sponsor-b-1']);
});
