import assert from 'node:assert/strict';
import test from 'node:test';
import { selectModelSiteQuotes } from '../src/model-site-quotes.js';
import { priceComparisonKey } from '../src/gateway-display.js';
import type { PublicGatewayModelSiteRow, PublicGatewayPriceRow } from '../src/store.js';

function price(groupId: string, inputPrice: number | null, currency = 'USD') {
  return { groupId, groupName: groupId, unit: '1M_tokens', currency, inputPrice } as PublicGatewayPriceRow;
}
function site(id: string, prices: PublicGatewayPriceRow[], sponsor = false, supportPoints = 0) {
  return { id, slug: id, name: id, host: `${id}.test`, url: `https://${id}.test`, sponsor,
    supportPoints, supportTotalCents: 0, siteScore: 0, pricesForModel: prices } as PublicGatewayModelSiteRow;
}

test('默认报价共享十行，两轮覆盖合作和赞赏站点且每站最多两个分组，其余报价完整保留', () => {
  const sites = [site('ordinary', [price('a', 0)])];
  for (let i = 0; i < 6; i++) {
    sites.push(site(`partner${i}`, [price('a', 30+i), price('b', 50+i), price('c', 70+i)], true, i));
    sites.push(site(`support${i}`, [price('a', 10+i)], false, i+1));
  }
  const quotes = selectModelSiteQuotes(sites);
  assert.deepEqual(quotes.slice(0, 10).map(q => [q.site.id,q.price.groupId]), [
    ['partner5','a'],['partner4','a'],['partner3','a'],['partner2','a'],['partner1','a'],['partner0','a'],
    ['support5','a'],['support4','a'],['support3','a'],['support2','a'],
  ]);
  assert.ok(quotes.slice(0,6).every(q => q.pinKind === 'partner'));
  assert.ok(quotes.slice(6,10).every(q => q.pinKind === 'support'));
  assert.ok(quotes.slice(10).every(q => q.pinKind === ''));
  assert.equal(quotes.length, 25);
  const selected = new Set(quotes.slice(0,10).map(q => `${q.site.id}:${q.price.groupId}`));
  assert.deepEqual(quotes.slice(10).map(q => `${q.site.id}:${q.price.groupId}`), sites.flatMap(s => s.pricesForModel.map(p => `${s.id}:${p.groupId}`)).filter(key => !selected.has(key)));
  assert.deepEqual(selectModelSiteQuotes(sites, {query:'partner0.test'}).map(q => q.pinKind), ['partner', 'partner', '']);
});

test('筛选后按原始顺序每组取一条报价，普通站保留全部分组', () => {
  const sites = [site('alpha', [price('a', null), price('b', 2), price('c', 1), price('c', 0.5, 'CNY')]), site('beta', [price('a', 0)])];
  assert.deepEqual(selectModelSiteQuotes(sites, {query:'ALPHA.TEST'}).map(q => q.price.groupId), ['a','b','c']);
  const cny = priceComparisonKey(price('c', 1, 'CNY'));
  assert.deepEqual(selectModelSiteQuotes(sites, {unit:cny}).map(q => [q.site.id,q.price.currency]), [['alpha','CNY']]);
  assert.deepEqual(selectModelSiteQuotes(sites, {query:'missing'}), []);
});

test('手动排序每商家最多置顶两个当前最优分组，取消后恢复默认分组名额', () => {
  const sites = [site('ordinary', [price('a',1),price('b',2),price('c',3)]), site('partner',[price('a',10),price('b',20),price('c',30)],true)];
  const quotes = selectModelSiteQuotes(sites, {compare:(a,b) => (b.price.inputPrice ?? 0)-(a.price.inputPrice ?? 0)});
  assert.deepEqual(quotes.map(q => [q.site.id,q.price.groupId]), [['partner','c'],['partner','b'],['partner','a'],['ordinary','c'],['ordinary','b'],['ordinary','a']]);
  assert.deepEqual(quotes.map(q => q.pinKind), ['partner', 'partner', '', '', '', '']);
  assert.deepEqual(selectModelSiteQuotes(sites).slice(0, 2).map(q => q.pinKind), ['partner', 'partner']);
  assert.equal(quotes.slice(0,3).length,3);
  assert.equal(quotes.slice(0,50).length,6);
});


test('最低评分筛选覆盖完整报价集，在置顶名额分配之前执行，保留门槛值', () => {
  const sites = [
    { ...site('low-partner', [price('a', 1)], true), siteScore: 59.9 },
    { ...site('boundary', [price('a', 2), price('b', 3), price('c', 4)]), siteScore: 60 },
    { ...site('high', [price('a', 5)]), siteScore: 90 },
    { ...site('unknown', [price('a', 6)]), siteScore: null },
  ];
  assert.deepEqual(selectModelSiteQuotes(sites, { minScore: 60 }).map(q => q.site.id), ['boundary', 'boundary', 'boundary', 'high']);
  assert.deepEqual(selectModelSiteQuotes(sites, { minScore: 90 }).map(q => q.site.id), ['high']);
  assert.deepEqual(selectModelSiteQuotes(sites, { minScore: 90, query: 'boundary' }), []);
  assert.equal(selectModelSiteQuotes(sites).length, 6);
});

test('默认顺序由后端提供，手动排序保留合作代表且其余报价按所选字段排列', () => {
  const sites = [
    { ...site('cheap-low', [price('a', 1)]), siteScore: 9 },
    { ...site('expensive-high', [price('a', 5)]), siteScore: 80 },
    { ...site('partner', [price('a', 3)], true), siteScore: 20 },
  ];
  assert.deepEqual(selectModelSiteQuotes(sites, { compare: (a, b) => (b.score ?? 0) - (a.score ?? 0) }).map(q => q.site.id), ['partner', 'expensive-high', 'cheap-low']);
  assert.deepEqual(selectModelSiteQuotes(sites, { compare: (a, b) => (a.score ?? 0) - (b.score ?? 0) }).map(q => q.site.id), ['partner', 'cheap-low', 'expensive-high']);
  assert.deepEqual(selectModelSiteQuotes(sites, { compare: (a, b) => (a.price.inputPrice ?? Infinity) - (b.price.inputPrice ?? Infinity) }).map(q => q.site.id), ['partner', 'cheap-low', 'expensive-high']);
  assert.deepEqual(selectModelSiteQuotes(sites).map(q => q.site.id), ['partner', 'cheap-low', 'expensive-high']);
});


test('原始顺序独立于评分和价格，手动排序后取消可恢复且筛选保序', () => {
  const sites = [
    { ...site('unknown-cheapest', [price('a', 0)]), siteScore: null },
    { ...site('high-expensive', [price('a', 8), price('b', 5), price('c', 2)]), siteScore: 90 },
    { ...site('low-cheap', [price('a', 1)]), siteScore: 60 },
    { ...site('high-cheap', [price('a', 1)]), siteScore: 90 },
    { ...site('zero', [price('a', 9)]), siteScore: 0 },
  ];
  const quotes = selectModelSiteQuotes(sites);
  assert.deepEqual(quotes.map(q => [q.site.id, q.price.groupId]), [
    ['unknown-cheapest', 'a'], ['high-expensive', 'a'], ['high-expensive', 'b'], ['high-expensive', 'c'],
    ['low-cheap', 'a'], ['high-cheap', 'a'], ['zero', 'a'],
  ]);
  selectModelSiteQuotes(sites, { compare: (a, b) => (b.score ?? 0) - (a.score ?? 0) });
  assert.deepEqual(selectModelSiteQuotes(sites), quotes);
  assert.deepEqual(selectModelSiteQuotes(sites, { minScore: 80 }), quotes.filter(q => (q.score ?? 0) >= 80));
});

test('赞赏站额外分组留在普通排序中，计价筛选后重新分配置顶名额', () => {
  const sites = [site('support', [price('a', 1), price('b', 3), price('c', 5), price('d', 7, 'CNY')], false, 1), site('ordinary', [price('a', 2), price('b', 4)])];
  const quotes = selectModelSiteQuotes(sites);
  assert.deepEqual(quotes.map(q => [q.site.id, q.price.groupId, q.pinKind]), [
    ['support', 'a', 'support'], ['support', 'b', 'support'],
    ['support', 'c', ''], ['support', 'd', ''], ['ordinary', 'a', ''], ['ordinary', 'b', ''],
  ]);
  assert.deepEqual(selectModelSiteQuotes(sites, { unit: priceComparisonKey(price('d', 7, 'CNY')) }).map(q => [q.price.groupId, q.pinKind]), [['d', 'support']]);
});

test('价格升序从每站全部分组重选两条置顶报价，其余分组继续按价格排列', () => {
  const sites = [site('ordinary', [price('a', 0)]), site('support', [price('a', 9), price('b', 1), price('c', 2)], false, 3)];
  const compare = (a: ReturnType<typeof selectModelSiteQuotes>[number], b: ReturnType<typeof selectModelSiteQuotes>[number]) => (a.price.inputPrice ?? Infinity) - (b.price.inputPrice ?? Infinity);
  const quotes = selectModelSiteQuotes(sites, {compare});
  assert.deepEqual(quotes.map(q => [q.site.id, q.price.groupId, q.pinKind]), [
    ['support','b','support'], ['support','c','support'], ['ordinary','a',''], ['support','a',''],
  ]);
  const filtered = selectModelSiteQuotes(sites.map(s => ({...s, pricesForModel: s.pricesForModel.filter(p => p.groupId !== 'b')})), {compare});
  assert.equal(filtered[0].price.groupId, 'c');
  assert.equal(filtered[0].pinKind, 'support');
});
