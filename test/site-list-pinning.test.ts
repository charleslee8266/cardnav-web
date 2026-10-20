/**
 * 文件说明: 验证商家分组限额、互斥优先级以及超额结果的完整保留。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { pinSiteRows } from '../src/site-list-pinning.js';

test('合作和赞赏组按积分排序，普通组保留原评分顺序', () => {
  const rows = [
    { id: 'ordinary', sponsor: false, supportTotalCents: 0, supportPoints: 0, favorite: false },
    { id: 'low', sponsor: false, supportTotalCents: 500, supportPoints: 5, favorite: false },
    { id: 'partner', sponsor: true, supportTotalCents: 0, supportPoints: 0, favorite: false },
    { id: 'favorite', sponsor: false, supportTotalCents: 0, supportPoints: 0, favorite: true },
    { id: 'high', sponsor: false, supportTotalCents: 50000, supportPoints: 50, favorite: true },
    { id: 'paid-partner', sponsor: true, supportTotalCents: 50000, supportPoints: 100, favorite: true },
  ];
  assert.deepEqual(pinSiteRows(rows).map(row => row.id), ['paid-partner', 'partner', 'high', 'low', 'favorite', 'ordinary']);
});

test('合作与赞赏合计最多20个，超额记录回收藏或普通组且不丢失', () => {
  const rows = Array.from({ length: 24 }, (_, id) => ({ id, sponsor: id % 2 === 0, supportTotalCents: 100, supportPoints: 1, favorite: id === 23 }));
  const kinds = new Map<number, string>();
  const sorted = pinSiteRows(rows, (item, kind) => kinds.set(item.id, kind));
  assert.deepEqual(sorted.map(row => row.id), [0,2,4,6,8,10,12,14,16,18,20,22,1,3,5,7,9,11,13,15,23,17,19,21]);
  assert.equal(new Set(sorted).size, rows.length);
  assert.equal(kinds.get(18), 'partner');
  assert.equal(kinds.get(19), '');
  assert.equal(kinds.get(23), 'favorite');
  for (const id of [17, 19, 21]) assert.equal(kinds.get(id), '');
});

test('高积分商家即使在原评分顺序末尾也能置顶，超额商家回到原位置', () => {
  const rows = Array.from({ length: 22 }, (_, id) => ({ id, sponsor: true, supportTotalCents: 0, supportPoints: id === 21 ? 100 : 0, favorite: false }));
  const sorted = pinSiteRows(rows);
  assert.deepEqual(sorted.slice(0, 20).map(row => row.id), [21, ...Array.from({ length: 19 }, (_, i) => i)]);
  assert.deepEqual(sorted.slice(20).map(row => row.id), [19, 20]);
});

test('累计赞赏不代替已归零的赞赏积分', () => {
  const rows = [
    { id: 'ordinary', sponsor: false, supportTotalCents: 10000, supportPoints: 0, favorite: false },
    { id: 'supporter', sponsor: false, supportTotalCents: 100, supportPoints: 1, favorite: false },
  ];
  assert.deepEqual(pinSiteRows(rows).map(row => row.id), ['supporter', 'ordinary']);
});

test('合作站点积分相同时沿用站点评分顺序', () => {
  const rows = [
    { id: 'higher-score', sponsor: true, supportTotalCents: 0, supportPoints: 20, favorite: false },
    { id: 'lower-score', sponsor: true, supportTotalCents: 0, supportPoints: 20, favorite: false },
    { id: 'higher-points', sponsor: true, supportTotalCents: 0, supportPoints: 30, favorite: false },
  ];
  assert.deepEqual(pinSiteRows(rows).map(row => row.id), ['higher-points', 'higher-score', 'lower-score']);
});

test('手动排序站点按原始顺位打破积分平局，入选站点按用户顺序展示', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    sponsor: false, supportTotalCents: 0, supportPoints: 1, favorite: true, defaultIndex: i,
  }));
  const kinds = new Map<typeof rows[number], string>();
  const output = pinSiteRows(rows.slice().reverse(), (row, kind) => kinds.set(row, kind), true);
  assert.deepEqual(output.map(row => row.defaultIndex), [9,8,7,6,5,4,3,2,1,0,11,10]);
  assert.ok(output.slice(0,10).every(row => kinds.get(row) === 'support'));
  assert.ok(output.slice(10).every(row => kinds.get(row) === ''));
});
