import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { buildShopSearchQuery, matchesShopSearchQuery } from '../src/shop-search-query.js';
import { matchesShopCategory } from '../src/shop-filter-state.js';
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
  classList = { add() {}, remove() {}, toggle() {} };
}

for (const kind of ['products', 'merchants'] as const) {
  test(`${kind} tab reports complete matching results, including zero, independently of page size`, () => {
    const badge = new Node();
    const summary = new Node();
    let filtered = true;
    const scope = {
      currentShopTab: kind, isShopProductsDataLoading: false,
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
    scope.isShopProductsDataLoading = true;
    render(0, 0);
    assert.equal(badge.textContent, '230', 'loading must not flash a zero result count');
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
    showSoldOutFilter: { checked: false }, matchCategoryFilter: { checked: false }, fuzzySearchFilter: { checked: false },
    onlyFavoritesFilter: { checked: false }, merchantFavoritesFilter: { checked: false },
    favoriteProductKeys: new Set(), favoriteSiteKeys: new Set(),
    platformOnly: () => false, merchantPlatformOnly: () => false, selectedPlatforms: () => [], selectedMerchantPlatforms: () => [],
    currentQuickPlanQuery: '', selectedQuickCategoryId: () => scope.currentQuickPlanQuery, matchesShopCategory,
    flatRows: [product(sites[0], 'gpt-plus', 20), product(sites[0], 'gpt-plus', 30), product(sites[1], 'claude-pro', 40), product(sites[1], 'gpt-plus', 50, 0)],
    shopProductsData: {}, shopSites: () => sites, shopSiteId: (site: typeof sites[number]) => site.id,
    shopSiteName: (site: typeof sites[number]) => site.name, shopSiteUrl: (site: typeof sites[number]) => site.url,
    buildShopSearchQuery, matchesShopSearchQuery, prioritizeShopProductRows,
  };
  for (const name of ['text', 'normalize', 'currentSearchFieldOptions', 'buildActiveSearchQuery', 'matchesSearchQuery', 'parseBound', 'matchesPriceRange', 'hasActiveProductFilters', 'hasActiveMerchantFilters', 'matchesMerchantFilters', 'prioritizeFavoriteFlatRows', 'searchMatchedFlatRows', 'matchingShopResults']) scope[name] = renderer('src/scripts/index.js', name, scope);
  let result = scope.matchingShopResults();
  assert.equal(result.products.length, 3);
  assert.equal(result.sites.length, 3, 'default stock filtering must not remove the empty merchant');
  scope.currentQuickPlanQuery = 'gpt-plus';
  result = scope.matchingShopResults();
  assert.equal(result.products.length, 2);
  assert.deepEqual(Array.from(result.sites, (site: any) => site.id), ['a', 'b', 'empty']);
  scope.showSoldOutFilter.checked = true;
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
  const selected: Record<string, string[]> = { family: ['gpt', 'claude'], payment: ['alipay', 'wechat'], status: ['hasPrice'] };
  const scope = { siteSearchInput: { value: '' }, siteFavoritesInput: { checked: false }, gatewayLists: { sites },
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
