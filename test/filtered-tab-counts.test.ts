/** 文件说明: 验证商品与商家筛选、完整计数和增量渲染行为。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { buildShopSearchQuery, matchesShopSearchQuery } from '../src/shop-search-query.js';
import { matchesShopCategory, searchShopProductRows } from '../src/shop-filter-state.js';
import { matchesListKinds } from '../src/list-kind-filter.js';
import { prioritizeShopProductRows } from '../src/shop-sponsored-pinning.js';

// Execute the production render functions with only their DOM/data boundaries replaced.
// This catches zero-result, deferred-data, and pagination regressions in visible counts.
function renderer(file: string, name: string, scope: Record<string, unknown>) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let declaration: ts.FunctionDeclaration | undefined;
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) declaration = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(declaration, `${name} exists`);
  return vm.runInNewContext(`(${declaration.getText(source)})`, scope) as (...args: unknown[]) => void;
}
class Node {
  textContent = '';
  classes = new Set<string>();
  classList = {
    add: (name: string) => { this.classes.add(name); },
    remove: (name: string) => { this.classes.delete(name); },
    toggle: (name: string, force?: boolean) => {
      const enabled = force ?? !this.classes.has(name);
      if (enabled) this.classes.add(name);
      else this.classes.delete(name);
    },
  };
}

for (const kind of ['products', 'shops'] as const) {
  test(`${kind} tab reports complete matching results, including zero, independently of page size`, () => {
    const badge = new Node();
    const summary = new Node();
    let filtered = true;
    const scope = {
      currentShopTab: kind,
      document: { querySelector: () => badge }, shopsMessages: {},
      hasActiveProductFilters: () => filtered, hasActiveMerchantFilters: () => filtered,
      totalProductCount: () => 230, totalSiteCount: () => 230, shopProductsDataIsPartial: () => false,
      flatProductLoadSummary: summary, flatProductLoadMoreButton: new Node(), flatProductProgressiveLoad: new Node(),
      merchantLoadSummary: summary, merchantLoadMoreButton: new Node(), merchantProgressiveLoad: new Node(),
    };
    const render = renderer('src/scripts/index.js', kind === 'products' ? 'updateFlatProgressiveLoadSummary' : 'updateMerchantProgressiveLoadSummary', scope);
    render(83, 50);
    assert.equal(badge.textContent, '83');
    assert.match(summary.textContent, /50 \/ 83/);
    render(83, 83);
    assert.equal(badge.textContent, '83');
    render(0, 0);
    assert.equal(badge.textContent, '0');
    filtered = false;
    render(50, 50);
    assert.equal(badge.textContent, '230');
  });
}

for (const type of ['sites', 'models'] as const) {
  test(`gateway ${type} tab uses filtered totals and preserves deferred unfiltered totals`, () => {
    const badge = new Node();
    const summary = new Node();
    let filtered = true;
    const render = renderer('src/scripts/llm-gateway-home.js', 'updateLoadMoreButton', {
      gatewayHome: { querySelector: (selector: string) => selector.includes('.tool-tab-badge') ? badge : new Node() },
      loadMoreWrap: () => new Node(), summaryLabel: () => summary, HTMLElement: Node,
      hasActiveFilters: () => filtered, displaySummaryText: (shown: number, total: number) => `${shown}/${total}`,
    });
    const state = { type, filteredEntries: Array(83), entries: Array(120), visibleLimit: 50, loaded: true, totalCount: 120, promise: null };
    render(state);
    assert.equal(badge.textContent, '83');
    assert.equal(summary.textContent, '50/83');
    state.visibleLimit = 100;
    render(state);
    assert.equal(badge.textContent, '83');
    state.filteredEntries = [];
    render(state);
    assert.equal(badge.textContent, '0');
    filtered = false; state.loaded = false; state.entries = Array(50); state.filteredEntries = state.entries;
    render(state);
    assert.equal(badge.textContent, '120');
  });
}

test('product filters leave merchant listings independent, including merchants without products', () => {
  const sites = [{ id: 'a', name: 'Alpha', url: 'https://a.test' }, { id: 'b', name: 'Beta', url: 'https://b.test' }, { id: 'empty', name: 'Empty', url: 'https://empty.test' }];
  const product = (site: typeof sites[number], autoCategory: string, priceValue: number, stock = 1) => ({ siteId: site.id, siteName: site.name, siteUrl: site.url, siteFavoriteKey: site.id, productFavoriteKey: `${site.id}-${priceValue}`, productName: 'subscription', productTitle: 'subscription', categoryName: '', autoCategory, priceValue, inStock: stock });
  const scope: Record<string, any> = {
    searchFilter: { value: '' }, merchantSearchFilter: { value: '' }, priceMin: { value: '' }, priceMax: { value: '' },
    inStockOnlyFilter: { checked: true }, matchCategoryFilter: { checked: false }, matchMerchantFilter: { checked: false }, fuzzySearchFilter: { checked: false },
    selectedOriginalCategories: () => [], selectedProductKinds: () => [], selectedMerchantKinds: () => [], matchesListKinds,
    shopSiteSponsor: () => false, shopSiteSupportPoints: () => 0,
    favoriteProductKeys: new Set(), favoriteSiteKeys: new Set(),
    currentFlatSort: null, scopedShopId: '',
    platformOnly: () => false, merchantPlatformOnly: () => false, selectedPlatforms: () => [], selectedMerchantPlatforms: () => [],
    currentQuickPlanQuery: '', selectedQuickCategoryId: () => scope.currentQuickPlanQuery, matchesShopCategory,
    flatRows: [product(sites[0], 'gpt-plus', 20), product(sites[0], 'gpt-plus', 30), product(sites[1], 'claude-pro', 40), product(sites[1], 'gpt-plus', 50, 0)],
    shopProductsData: {}, shopSites: () => sites, shopSiteId: (site: typeof sites[number]) => site.id,
    shopSiteName: (site: typeof sites[number]) => site.name, shopSiteUrl: (site: typeof sites[number]) => site.url,
    buildShopSearchQuery, matchesShopSearchQuery, searchShopProductRows, prioritizeShopProductRows,
  };
  for (const name of ['text', 'normalize', 'currentSearchFieldOptions', 'buildActiveSearchQuery', 'matchesSearchQuery', 'parseBound', 'matchesPriceRange', 'hasActiveProductFilters', 'hasActiveMerchantFilters', 'matchesMerchantFilters', 'prioritizeFavoriteFlatRows', 'searchMatchedFlatRows', 'matchingShopResults']) scope[name] = renderer('src/scripts/index.js', name, scope);
  let result = scope.matchingShopResults();
  assert.equal(result.products.length, 3);
  assert.equal(result.sites.length, 3, 'default stock filtering must not remove the empty merchant');
  scope.currentQuickPlanQuery = 'gpt-plus';
  result = scope.matchingShopResults();
  assert.equal(result.products.length, 2);
  assert.deepEqual(Array.from(result.sites, (site: any) => site.id), ['a', 'b', 'empty']);
  scope.inStockOnlyFilter.checked = false;
  result = scope.matchingShopResults();
  assert.equal(result.products.length, 3);
  assert.equal(result.sites.length, 3);
  scope.flatRows.forEach((row: any, index: number) => { row.platformHosted = index < 2; row.platformName = index < 2 ? 'Platform A' : 'Self hosted'; });
  scope.selectedPlatforms = () => ['Platform A'];
  result = scope.matchingShopResults();
  assert.equal(result.products.length, 2);
  assert.equal(result.sites.length, 3);
  scope.selectedPlatforms = () => ['Platform A', 'self-hosted'];
  result = scope.matchingShopResults();
  assert.equal(result.products.length, 3, 'multiple platforms are alternatives within the product tab');
  scope.selectedPlatforms = () => [];
  scope.merchantSearchFilter.value = 'Beta';
  result = scope.matchingShopResults();
  assert.equal(result.products.length, 3);
  assert.deepEqual(Array.from(result.sites, (site: any) => site.id), ['b']);
  scope.selectedMerchantPlatforms = () => ['self-hosted'];
  scope.shopSitePlatformName = (site: any) => site.id === 'a' ? 'Platform A' : '';
  result = scope.matchingShopResults();
  assert.deepEqual(Array.from(result.sites, (site: any) => site.id), ['b']);
  assert.equal(result.products.length, 3, 'merchant platforms must not constrain product results');
  scope.selectedMerchantPlatforms = () => ['Platform A'];
  result = scope.matchingShopResults();
  assert.equal(result.sites.length, 0, 'merchant keyword and platform intersect');
  scope.selectedMerchantPlatforms = () => [];
  scope.priceMax.value = '40';
  result = scope.matchingShopResults();
  assert.equal(result.products.length, 2);
  assert.deepEqual(Array.from(result.sites, (site: any) => site.id), ['b']);
  scope.selectedMerchantKinds = () => ['partner'];
  scope.shopSiteSponsor = (site: any) => site.id === 'a';
  result = scope.matchingShopResults();
  assert.equal(result.sites.length, 0, 'merchant type intersects the merchant search');
  assert.equal(result.products.length, 2, 'merchant type does not constrain products');
  scope.merchantSearchFilter.value = '';
  result = scope.matchingShopResults();
  assert.deepEqual(Array.from(result.sites, (site: any) => site.id), ['a']);
  scope.selectedProductKinds = () => ['favorite'];
  scope.favoriteProductKeys.add(scope.flatRows[1].productFavoriteKey);
  result = scope.matchingShopResults();
  assert.equal(result.products.length, 1);
  assert.deepEqual(Array.from(result.sites, (site: any) => site.id), ['a']);
});

test('gateway models combine multiple selected families with keywords', () => {
  const models = { entries: [
    { search: 'gpt model', sort: { family: 'GPT', provider: 'OpenAI' } },
    { search: 'gemma model', sort: { family: 'Gemma', provider: 'Google' } },
    { search: 'claude model', sort: { family: 'Claude', provider: 'Anthropic' } },
  ], filteredEntries: [] };
  let selected: string[] = [];
  const scope = { modelSearchInput: { value: 'model' }, modelFamilies: () => selected, modelProviders: (): string[] => [],
    matchesAny: (values: string[], available: string[]) => !values.length || values.some(value => available.includes(value)),
    gatewayLists: { models }, gatewayProviderSlug: (value: string) => value.toLowerCase() };
  const filter = renderer('src/scripts/llm-gateway-home.js', 'filterModelEntries', scope);
  filter(); assert.equal(models.filteredEntries.length, 3);
  selected = ['gpt', 'claude'];
  filter(); assert.equal(models.filteredEntries.length, 2);
  scope.modelSearchInput.value = 'claude';
  filter(); assert.equal(models.filteredEntries.length, 1);
  selected = ['gpt'];
  filter(); assert.equal(models.filteredEntries.length, 0);
  scope.modelSearchInput.value = '';
  selected = [];
  scope.modelProviders = () => ['openai', 'anthropic'];
  filter(); assert.equal(models.filteredEntries.length, 2);
  selected = ['gemma'];
  filter(); assert.equal(models.filteredEntries.length, 0);
  selected = ['claude'];
  filter(); assert.equal(models.filteredEntries.length, 1);
});

test('gateway site capabilities require all selected models and payments while status choices remain alternatives', () => {
  const site = (families: string, payments: string, priceCount: number, modelCount = 1) => ({ search: families, families, payments, priceCount, sort: { modelCount } });
  const sites = { entries: [site('gpt', 'alipay', 1), site('claude', 'wechat', 1), site('gpt,claude', 'alipay,wechat', 1), site('gpt,claude', 'alipay,wechat', 0), site('gpt,claude', 'alipay', 1)], filteredEntries: [] };
  const selected: Record<string, string[]> = { family: ['gpt', 'claude'], payment: ['alipay', 'wechat'], status: ['hasPrice'], kind: [] };
  const scope = { siteSearchInput: { value: '' }, matchesListKinds, favorites: { has: () => false }, gatewayLists: { sites },
    selectedValues: (name: string) => selected[name],
    matchesAllSelections: (values: string[], available: string[]) => values.every(value => available.includes(value)),
    matchesAny: (values: string[], available: string[]) => !values.length || values.some(value => available.includes(value)) };
  const filter = renderer('src/scripts/llm-gateway-home.js', 'filterSiteEntries', scope);
  filter(); assert.equal(sites.filteredEntries.length, 1);
  selected.status.push('noPrice');
  filter(); assert.equal(sites.filteredEntries.length, 2);
  selected.payment = ['alipay'];
  filter(); assert.equal(sites.filteredEntries.length, 3);
  scope.siteSearchInput.value = 'gemini';
  filter(); assert.equal(sites.filteredEntries.length, 0);
});

test('gateway type filters match actual statuses independently of pin allocation and sorting', () => {
  const entries = [
    { item: { slug: 'partner' }, sort: { sticky: 1, support: 5, modelCount: 1 } },
    { item: { slug: 'favorite' }, sort: { sticky: 0, support: 0, modelCount: 1 } },
    { item: { slug: 'other' }, sort: { sticky: 0, support: 0, modelCount: 1 } },
  ].map(entry => ({ ...entry, search: '', families: '', payments: '', priceCount: 1 }));
  const sites = { entries, filteredEntries: [], sort: { key: 'score', direction: 'desc' } };
  let kinds: string[] = ['favorite'];
  const filter = renderer('src/scripts/llm-gateway-home.js', 'filterSiteEntries', {
    siteSearchInput: { value: '' }, gatewayLists: { sites }, matchesListKinds,
    favorites: { has: (key: string) => key !== 'other' },
    selectedValues: (name: string) => name === 'kind' ? kinds : [],
    matchesAllSelections: () => true, matchesAny: () => true,
  });
  filter(); assert.deepEqual(Array.from(sites.filteredEntries), entries.slice(0, 2));
  kinds = ['support'];
  filter(); assert.deepEqual(Array.from(sites.filteredEntries), entries.slice(0, 1));
  kinds = ['partner', 'other'];
  filter(); assert.deepEqual(Array.from(sites.filteredEntries), [entries[0], entries[2]]);
});

test('product fetch failure ends loading, keeps existing rows and permits a successful retry', async () => {
  const existingRow = { product: 'existing' };
  let attempts = 0;
  const scope = {
    shopsMessages: {}, shopProductsDataIsPartial: () => true,
    shopProductsDataLoadPromise: null,
    currentShopTab: 'products',
    shopListLoading: { products: { run: (task: () => Promise<boolean>) => task() } },
    fetch: async () => ({ ok: ++attempts > 1, status: 503, json: async () => ({ p: [], s: [] }) }),
    replaceShopProductsData: async () => {},
    currentFlatRows: [existingRow],
    currentFlatVisibleLimit: 100,
    currentMerchantVisibleLimit: 20,
    rowContainer: { querySelectorAll: () => [] },
    updateFlatProgressiveLoadSummary: () => {},
    updateMerchantProgressiveLoadSummary: () => {},
  };
  const load = renderer('src/scripts/index.js', 'loadShopProductsDataFromApi', scope) as unknown as () => Promise<boolean>;
  assert.equal(await load(), false);
  assert.equal(scope.shopProductsDataLoadPromise, null);
  assert.deepEqual(scope.currentFlatRows, [existingRow]);
  assert.equal(await load(), true);
  assert.equal(attempts, 2);
});


test('the first 100 products retain the full count and load-more entry until all results are shown', () => {
  const badge = new Node();
  const summary = new Node();
  const button = new Node();
  const footer = new Node();
  button.classList.add('hidden');
  let partial = true;
  const render = renderer('src/scripts/index.js', 'updateFlatProgressiveLoadSummary', {
    currentShopTab: 'products',
    document: { querySelector: () => badge }, shopsMessages: {},
    hasActiveProductFilters: () => false,
    totalProductCount: () => 1200,
    shopProductsDataIsPartial: () => partial,
    flatProductLoadSummary: summary, flatProductLoadMoreButton: button, flatProductProgressiveLoad: footer,
  });
  render(100, 100);
  assert.equal(badge.textContent, '1200');
  assert.match(summary.textContent, /100 \/ 1200/);
  assert.equal(button.classes.has('hidden'), false);
  assert.equal(footer.classes.has('hidden'), false);
  partial = false;
  render(1200, 200);
  assert.equal(button.classes.has('hidden'), false);
  render(1200, 1200);
  assert.equal(button.classes.has('hidden'), true);
});

test('Gateway shared request failure preserves sorting and visible range for every caller, then permits retry', async () => {
  let reject!: (error: Error) => void;
  const request = new Promise<never>((_, no) => { reject = no; });
  let fetches = 0;
  const oldSort = { key: 'score', direction: 'desc', type: 'number' };
  const state = { loaded: false, promise: null, apiUrl: '/test', entries: [], pageSize: 50, visibleLimit: 100, totalCount: 120, sort: oldSort, loading: { run: (task: () => Promise<unknown>) => task() } };
  const button = { removeAttribute() {}, setAttribute() {} };
  const scope: any = {
    gatewayLists: { sites: state }, gatewayHome: { querySelector: () => button },
    fetch: async () => { fetches++; return request; },
    updateLoadMoreButton: () => {},
    siteEntryFromItem: (item: unknown) => item,
  };
  const load = renderer('src/scripts/llm-gateway-home.js', 'ensureGatewayDataLoaded', scope) as unknown as (type: string) => Promise<unknown>;
  class Control {
    dataset = { sortKey: 'score' };
    closest(selector: string) {
      if (selector === '[data-table]') return {};
      if (selector === '[data-gateway-panel]') return { dataset: { gatewayPanel: 'sites' } };
      if (selector === '.data-table-sort-button') return this;
      return null;
    }
  }
  const handle = renderer('src/scripts/llm-gateway-home.js', 'handleGatewaySort', {
    ...scope, Element: Control, HTMLElement: Control, ensureGatewayDataLoaded: load,
    nextTableSort() { throw new Error('must not change sort after failure'); },
  });
  const a = load('sites');
  const b = load('sites');
  const click = handle({ target: new Control(), preventDefault() {}, stopImmediatePropagation() {} });
  reject(new Error('offline'));
  assert.deepEqual(await Promise.all([a, b, click]), [null, null, undefined]);
  assert.equal(fetches, 1);
  assert.equal(state.sort, oldSort);
  assert.equal(state.visibleLimit, 100);
  assert.equal(state.promise, null);
  assert.equal(state.loaded, false);
  state.entries = [{ id: 'stale' }] as any;
  scope.fetch = async () => ({ ok: true, json: async () => ({ items: [{ id: 'current' }], totalCount: 1 }) });
  assert.equal(await load('sites'), 1);
  assert.equal(state.loaded, true);
  assert.deepEqual(Array.from(state.entries), [{ id: 'current' }]);
  assert.equal(state.totalCount, 1);
  state.loaded = false;
  scope.fetch = async () => ({ ok: true, json: async () => ({ items: [], totalCount: 0 }) });
  assert.equal(await load('sites'), 0);
  assert.equal(state.entries.length, 0);
  assert.equal(state.totalCount, 0);
});

test('product initialization preserves server order even when a later product has a higher score', async () => {
  const accessors = await import('../src/shop-products-data.js');
  const rows: any[] = [];
  const data = {
    v: 1, s: [['a', 'Alpha', 'https://a.test', null, 1]], c: ['Account'], u: ['¥'], sc: 1, pc: 2, l: null, x: 0,
    p: [
      [0, 0, 'First', 10, 0, 'https://a.test/first', 1, 1, null, 1, 'first', 'gpt-plus'],
      [0, 0, 'Second', 20, 0, 'https://a.test/second', 1, 1, null, 99, 'second', 'gpt-plus'],
    ],
  };
  const build = renderer('src/scripts/index.js', 'buildFlatRows', {
    ...accessors, shopProductsData: data, flatRows: rows, text: String,
    document: { documentElement: { lang: 'zh' } }, shopsMessages: {},
    autoCategoryLabel: () => '', formatDisplayPrice: String, priceValueForSort: Number, productStockValue: () => 1,
  });
  build();
  assert.deepEqual(rows.map(row => row.productName), ['first', 'second']);
  assert.deepEqual(rows.map(row => row.originalIndex), [0, 1]);
});

test('product load-more appends the next range and preserves existing row elements and sequence', () => {
  const row = () => ({ dataset: {}, classList: { remove() {} } });
  const first = row(), second = row(), third = row();
  const container = {
    children: [first, second],
    querySelectorAll() { return this.children; },
    appendChild(fragment: {children: ReturnType<typeof row>[]}) { this.children.push(...fragment.children); },
    replaceChildren(fragment: {children: ReturnType<typeof row>[]}) { this.children = [...fragment.children]; },
  };
  const entries = [first, second, third].map((element,index)=>({element,product:String(index),productFavoriteKey:String(index)}));
  const scope = {
    flatProductRowsContainer: container,
    currentFlatRows: entries,
    currentFlatVisibleLimit: 3,
    document: { createDocumentFragment: () => ({children: [] as ReturnType<typeof row>[], appendChild(element: ReturnType<typeof row>) {this.children.push(element);} }) },
    ensureFlatRowElement: (entry: typeof entries[number]) => entry.element,
    shopProductId: String,
    searchFilter: {value:''}, favoriteProductKeys:new Set(),
    setTableRowSequence: (element: ReturnType<typeof row>,index: number) => { Object.assign(element.dataset,{sequence:String(index)}); },
    productMetricTracker: {observe() {}},
  };
  const append = renderer('src/scripts/index.js','appendCurrentFlatRows',scope);
  append(true);
  assert.deepEqual(container.children,[first,second,third]);
  assert.equal(container.children[0],first);
  assert.equal(container.children[1],second);
  assert.equal((third.dataset as Record<string,string>).sequence,'3');
  // A changed order replaces the displayed range; load-more must not leave stale rows.
  scope.currentFlatRows = entries.slice().reverse();
  scope.currentFlatVisibleLimit = 2;
  append();
  assert.deepEqual(container.children,[third,second]);
  assert.equal((third.dataset as Record<string,string>).sequence,'1');
});

test('merchant search keeps direct products first while sharing the full-result pin allowance', () => {
  const rows = Array.from({ length: 32 }, (_, index) => ({
    id: String(index), productFavoriteKey: String(index), siteFavoriteKey: String(Math.floor(index / 4)),
    score: index, inStock: 1 as const, sponsor: true, merchantSearchMatch: index >= 16, pinKind: '',
  }));
  const favorites = { favoriteProductKeys: new Set<string>(), favoriteSiteKeys: new Set<string>() };
  const expected = prioritizeShopProductRows(rows.map(row => ({ ...row })), favorites, (row, kind) => { row.pinKind = kind; });
  const prioritize = renderer('src/scripts/index.js', 'prioritizeFavoriteFlatRows', {
    ...favorites, prioritizeShopProductRows, currentFlatSort: null, shopsMessages: {},
  }) as unknown as (rows: typeof expected) => typeof expected;
  const result = prioritize(rows);
  assert.equal(result.filter(row => row.pinKind === 'partner').length, expected.filter(row => row.pinKind === 'partner').length);
  assert.equal(new Set(result.map(row => row.id)).size, rows.length);
  assert.equal(result.slice(0, 16).every(row => !row.merchantSearchMatch), true);
  assert.equal(result.slice(16).every(row => row.merchantSearchMatch), true);
});

test('switching product tabs during a shared request shows feedback in both lists without fetching twice', async () => {
  let resolve!: (value: unknown) => void;
  const response = new Promise(yes => { resolve = yes; });
  let fetches = 0;
  const pending = { products: 0, shops: 0 };
  const feedback = (kind: 'products' | 'shops') => ({ run: async (task: () => Promise<unknown>) => {
    pending[kind]++;
    try { return await task(); } finally { pending[kind]--; }
  } });
  const scope = {
    shopsMessages: {}, shopProductsDataIsPartial: () => true, shopProductsDataLoadPromise: null, currentShopTab: 'products',
    shopListLoading: { products: feedback('products'), shops: feedback('shops') },
    fetch: async () => { fetches++; return response; }, replaceShopProductsData: async () => {},
  };
  const load = renderer('src/scripts/index.js', 'loadShopProductsDataFromApi', scope) as unknown as () => Promise<boolean>;
  const products = load();
  scope.currentShopTab = 'shops';
  const merchants = load();
  assert.deepEqual(pending, { products: 1, shops: 1 });
  assert.equal(fetches, 1);
  resolve({ ok: true, json: async () => ({ p: [], s: [] }) });
  assert.deepEqual(await Promise.all([products, merchants]), [true, true]);
  assert.deepEqual(pending, { products: 0, shops: 0 });
});

test('库存分组优先于搜索直接匹配和商家补充结果', () => {
  const rows = [
    { id: 'sold-direct', inStock: 0, merchantSearchMatch: false },
    { id: 'available-merchant', inStock: 1, merchantSearchMatch: true },
    { id: 'available-direct', inStock: 1, merchantSearchMatch: false },
    { id: 'sold-merchant', inStock: 0, merchantSearchMatch: true },
  ].map(item => ({ ...item, score: 0, productFavoriteKey: item.id, siteFavoriteKey: item.id }));
  const prioritize = renderer('src/scripts/index.js', 'prioritizeFavoriteFlatRows', {
    favoriteProductKeys: new Set(), favoriteSiteKeys: new Set(), prioritizeShopProductRows,
    currentFlatSort: null, shopsMessages: {},
  }) as unknown as (entries: typeof rows) => typeof rows;
  assert.deepEqual(Array.from(prioritize(rows), item => item.id), ['available-direct', 'available-merchant', 'sold-direct', 'sold-merchant']);
});
