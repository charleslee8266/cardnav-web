import assert from 'node:assert/strict';
import test from 'node:test';
import { pinListRows, type PinKind } from '../src/list-pinning.js';

test('手动排序保留精简商业置顶，收藏回归普通顺序，恢复默认后恢复收藏置顶', () => {
  const rows = [
    { id: 'ordinary', sponsor: false, supportPoints: 0 },
    { id: 'favorite', sponsor: false, supportPoints: 0 },
    { id: 'support', sponsor: false, supportPoints: 5 },
    { id: 'partner', sponsor: true, supportPoints: 1 },
  ];
  const kinds = new Map<string, PinKind>();
  const options = {
    site: (row: typeof rows[number]) => row,
    favorites: (remaining: typeof rows) => remaining.filter(row => row.id === 'favorite'),
    onPin: (row: typeof rows[number], kind: PinKind) => kinds.set(row.id, kind),
  };
  const defaultRows = pinListRows(rows, options);
  assert.deepEqual(defaultRows.map(row => row.id), ['partner', 'support', 'favorite', 'ordinary']);
  for (const manualRows of [rows, rows.slice().reverse()]) {
    assert.deepEqual(pinListRows(manualRows, { ...options, manualSort: true }).map(row => row.id), ['partner', 'support', ...manualRows.filter(row => row.id === 'ordinary' || row.id === 'favorite').map(row => row.id)]);
    assert.equal(kinds.get('favorite'), '');
    assert.equal(kinds.get('partner'), 'partner');
    assert.equal(kinds.get('support'), 'support');
  }
  assert.deepEqual(pinListRows(rows, options), defaultRows);
  assert.deepEqual(rows.map(row => kinds.get(row.id)), ['', 'favorite', 'support', 'partner']);
});

for (const [partnerCount, supportCount, expectedPartners, expectedSupporters] of [
  [0, 12, [], [11,10,9,8,7,6,5,4,3,2]],
  [0, 8, [], [7,7,6,6,5,4,3,2,1,0]],
  [0, 6, [], [5,5,4,4,3,3,2,2,1,0]],
  [0, 5, [], [4,4,3,3,2,2,1,1,0,0]],
  [2, 12, [1,0], [13,12,11,10,9,8,7,6]],
  [2, 7, [1,1,0], [8,7,6,5,4,3,2]],
  [3, 12, [2,1,0], [14,13,12,11,10,9,8]],
  [6, 12, [5,4,3,2,1,0], [17,16,15,14]],
  [6, 0, [5,5,4,4,3,3,2,2,1,0], []],
  [12, 12, [11,10,9,8,7,6,5,4,3,2], []],
] as const) {
  test(`手动排序合作${partnerCount}家赞赏${supportCount}家优先分两轮名额，每家最多两行且整体十行`, () => {
    const rows = Array.from({ length: partnerCount + supportCount }, (_, i) => [0, 1, 2].map(variant => ({
      id: String(i), variant, sponsor: i < partnerCount, supportPoints: i + 1,
      defaultIndex: i * 3 + variant, price: i * 10 + variant,
    }))).flat();
    for (const direction of [1, -1]) {
      const input = rows.slice().sort((a, b) => direction * (a.price - b.price));
      const kinds = new Map<typeof rows[number], PinKind>();
      const output = pinListRows(input, {
        site: row => row,
        manualSort: true, defaultOrder: (a,b) => a.defaultIndex-b.defaultIndex,
        onPin: (row, kind) => kinds.set(row, kind),
      });
      const pins = output.filter(row => kinds.get(row));
      const partners = pins.filter(row => kinds.get(row) === 'partner');
      const supporters = pins.filter(row => kinds.get(row) === 'support');
      const ids = (group: typeof rows) => group.map(row => Number(row.id)).sort((a,b) => b-a);
      assert.deepEqual(ids(partners), expectedPartners);
      assert.deepEqual(ids(supporters), expectedSupporters);
      assert.equal(pins.length, 10);
      assert.equal(new Set(pins.map(row => row.id)).size, Math.min(10,partnerCount+supportCount));
      for (const id of new Set(pins.map(row => row.id))) {
        const selected = pins.filter(row => row.id === id);
        assert.deepEqual(selected, input.filter(row => row.id === id).slice(0,selected.length));
        assert.ok(selected.length <= 2);
      }
      for (const group of [partners, supporters]) assert.deepEqual(group, input.filter(row => group.includes(row)));
      assert.deepEqual(output.slice(10), input.filter(row => !pins.includes(row)));
      assert.equal(output.length, input.length);
      assert.equal(new Set(output).size, input.length);
    }
  });
}

for (const sponsor of [true, false]) {
  test(`只有一家${sponsor ? '合作' : '赞赏'}商家时展示两行，候选不足时按实际数量`, () => {
    const rows = Array.from({length: 5}, (_,i) => ({id: 'only', sponsor, supportPoints: 1, price: i}));
    for (const input of [rows, rows.slice(0,1)]) {
      const kinds = new Map<typeof rows[number], PinKind>();
      const output = pinListRows(input, {site: row => row, manualSort: true, onPin: (row,kind) => kinds.set(row,kind)});
      assert.deepEqual(output, input);
      assert.deepEqual(output.map(row => kinds.get(row)), input.map((_,i) => i < 2 ? (sponsor ? 'partner' : 'support') : ''));
    }
  });
}

test('积分相同用后端顺序选商家，筛选后重选并清理超额行高亮', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({id: String(i), sponsor: false, supportPoints: 1, defaultIndex: i}));
  const kinds = new Map<typeof rows[number], PinKind>();
  const options = {
    site: (row: typeof rows[number]) => row, manualSort: true,
    defaultOrder: (a: typeof rows[number], b: typeof rows[number]) => a.defaultIndex-b.defaultIndex,
    onPin: (row: typeof rows[number], kind: PinKind) => kinds.set(row, kind),
  };
  const input = rows.slice().reverse();
  const output = pinListRows(input, options);
  assert.deepEqual(output.slice(0,10).map(row => row.id), ['9','8','7','6','5','4','3','2','1','0']);
  assert.equal(kinds.get(rows[11]), '');
  const filtered = input.filter(row => row.defaultIndex >= 8);
  assert.deepEqual(pinListRows(filtered, options), filtered);
  assert.ok(filtered.every(row => kinds.get(row) === 'support'));
});

for (const [partners, supporters, partnerPins, supportPins] of [
  [0, 10, 0, 20], [0, 11, 0, 11], [3, 9, 6, 9], [4, 14, 6, 14],
  [4, 15, 5, 15], [4, 16, 4, 16], [4, 17, 4, 16], [21, 0, 20, 0],
]) {
  test(`默认排序合作${partners}家赞赏${supporters}家，先覆盖商家再按资格补第二行`, () => {
    const rows = Array.from({ length: partners + supporters }, (_, index) =>
      [0, 1, 2].map(variant => ({ id: String(index), variant, sponsor: index < partners, supportPoints: index + 1 }))
    ).flat();
    const kinds = new Map<typeof rows[number], PinKind>();
    const output = pinListRows(rows, { site: row => row, onPin: (row, kind) => kinds.set(row, kind) });
    const pins = output.filter(row => kinds.get(row));
    assert.equal(pins.filter(row => kinds.get(row) === 'partner').length, partnerPins);
    assert.equal(pins.filter(row => kinds.get(row) === 'support').length, supportPins);
    assert.equal(new Set(pins.map(row => row.id)).size, Math.min(20, partners + supporters));
    assert.equal(new Set(output).size, rows.length);
    assert.deepEqual(output.slice(pins.length), rows.filter(row => !pins.includes(row)));
    for (const row of pins) assert.ok(row.variant < (row.sponsor || partners + supporters <= 10 ? 2 : 1));
  });
}

test('分类筛选重新计算商家数，切换手动排序收紧额度并取消收藏置顶', () => {
  const rows = Array.from({ length: 11 }, (_, index) => [0, 1].map(variant => ({
    id: String(index), variant, supportPoints: 1, category: index < 10 ? 'selected' : 'other',
  }))).flat();
  const favorite = { id: 'favorite', variant: 0, supportPoints: 0, category: 'selected' };
  const kinds = new Map<typeof rows[number], PinKind>();
  const options = { site: (row: typeof rows[number]) => row,
    onPin: (row: typeof rows[number], kind: PinKind) => kinds.set(row, kind),
    favorites: (remaining: typeof rows) => remaining.filter(row => row === favorite) };
  pinListRows([...rows, favorite], options);
  assert.equal([...kinds.values()].filter(kind => kind === 'support').length, 11);
  const filtered = [...rows, favorite].filter(row => row.category === 'selected');
  const output = pinListRows(filtered, options);
  assert.equal(output.slice(0, 20).filter(row => kinds.get(row) === 'support').length, 20);
  assert.equal(kinds.get(favorite), 'favorite');
  const manual = pinListRows(filtered, { ...options, manualSort: true });
  assert.equal(manual.filter(row => kinds.get(row) === 'support').length, 10);
  assert.equal(kinds.get(favorite), '');
  assert.deepEqual(pinListRows(filtered, options), output);
});
