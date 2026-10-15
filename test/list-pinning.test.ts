import assert from 'node:assert/strict';
import test from 'node:test';
import { pinListRows, type PinKind } from '../src/list-pinning.js';

test('手动排序时全部置顶失效且清除高亮，恢复默认后重新分配置顶', () => {
  const rows = [
    { id: 'ordinary', sponsor: false, supportPoints: 0 },
    { id: 'favorite', sponsor: false, supportPoints: 0 },
    { id: 'support', sponsor: false, supportPoints: 5 },
    { id: 'partner', sponsor: true, supportPoints: 1 },
  ];
  const kinds = new Map<string, PinKind>();
  const options = {
    site: (row: typeof rows[number]) => row,
    partner: { rows: 10 }, support: { rows: 10 },
    favorites: (remaining: typeof rows) => remaining.filter(row => row.id === 'favorite'),
    onPin: (row: typeof rows[number], kind: PinKind) => kinds.set(row.id, kind),
  };
  const defaultRows = pinListRows(rows, options);
  assert.deepEqual(defaultRows.map(row => row.id), ['partner', 'support', 'favorite', 'ordinary']);
  for (const manualRows of [rows, rows.slice().reverse()]) {
    assert.deepEqual(pinListRows(manualRows, { ...options, enabled: false }), manualRows);
    assert.ok([...kinds.values()].every(kind => kind === ''));
  }
  assert.deepEqual(pinListRows(rows, options), defaultRows);
  assert.deepEqual(rows.map(row => kinds.get(row.id)), ['', 'favorite', 'support', 'partner']);
});

test('行名额和站点名额仅限制置顶，超额合作记录保持普通顺序且不会进入赞赏组', () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    key: index, id: String(index % 3), sponsor: true, supportPoints: 1,
  }));
  for (const limits of [
    { rows: 4, rowsPerSite: 2 },
    { sites: 2, rowsPerSite: 2, adjacentBySite: true },
  ]) {
    const kinds = new Map<typeof rows[number], PinKind>();
    const result = pinListRows(rows, {
      site: row => row, partner: limits, support: limits,
      onPin: (row, kind) => { assert.ok(!kinds.has(row)); kinds.set(row, kind); },
    });
    assert.equal(result.length, rows.length);
    assert.deepEqual(new Set(result), new Set(rows));
    assert.equal(kinds.size, rows.length);
    assert.equal(result.filter(row => kinds.get(row) === 'partner').length, 4);
    assert.ok(result.every(row => kinds.get(row) !== 'support'));
    const regular = rows.filter(row => kinds.get(row) === '');
    assert.deepEqual(result.slice(4), regular);
    for (const id of ['0', '1', '2']) {
      assert.ok(result.filter(row => row.id === id && kinds.get(row) === 'partner').length <= 2);
    }
  }
  assert.deepEqual(rows.map(row => row.key), Array.from({ length: 12 }, (_, index) => index));
});
