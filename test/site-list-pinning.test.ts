/**
 * 文件说明: 验证商家分组限额、互斥优先级以及超额结果的完整保留。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { pinSiteRows } from '../src/site-list-pinning.js';

test('合作、赞赏、收藏和普通组保留各自原顺序，不按赞赏金额重排', () => {
  const rows = [
    { id: 'ordinary', sponsor: false, supportTotalCents: 0, favorite: false },
    { id: 'low', sponsor: false, supportTotalCents: 500, favorite: false },
    { id: 'partner', sponsor: true, supportTotalCents: 0, favorite: false },
    { id: 'favorite', sponsor: false, supportTotalCents: 0, favorite: true },
    { id: 'high', sponsor: false, supportTotalCents: 50000, favorite: true },
    { id: 'paid-partner', sponsor: true, supportTotalCents: 50000, favorite: true },
  ];
  assert.deepEqual(pinSiteRows(rows).map(row => row.id), ['partner', 'paid-partner', 'low', 'high', 'favorite', 'ordinary']);
});

test('合作与赞赏各最多10个，超额记录回收藏或普通组且不丢失', () => {
  const rows = Array.from({ length: 24 }, (_, id) => ({ id, sponsor: id % 2 === 0, supportTotalCents: 100, favorite: id === 23 }));
  const sorted = pinSiteRows(rows);
  assert.deepEqual(sorted.map(row => row.id), [0,2,4,6,8,10,12,14,16,18,1,3,5,7,9,11,13,15,17,19,23,20,21,22]);
  assert.equal(new Set(sorted).size, rows.length);
});
