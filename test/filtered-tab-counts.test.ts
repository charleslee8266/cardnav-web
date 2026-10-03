import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { buildShopSearchQuery, matchesShopSearchQuery } from '../src/shop-search-query.js';
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
    platformOnly: () => false,
    flatRows: [product(sites[0], 'gpt-plus', 20), product(sites[0], 'gpt-plus', 30), product(sites[1], 'claude-pro', 40), product(sites[1], 'gpt-plus', 50, 0)],
    shopProductsData: {}, shopSites: () => sites, shopSiteId: (site: typeof sites[number]) => site.id,
    shopSiteName: (site: typeof sites[number]) => site.name, shopSiteUrl: (site: typeof sites[number]) => site.url,
    buildShopSearchQuery, matchesShopSearchQuery, prioritizeShopProductRows,
  };
  for (const name of ['text', 'normalize', 'currentSearchFieldOptions', 'buildActiveSearchQuery', 'matchesSearchQuery', 'parseBound', 'matchesPriceRange', 'hasActiveProductFilters', 'hasActiveMerchantFilters', 'matchesMerchantFilters', 'prioritizeFavoriteFlatRows', 'searchMatchedFlatRows', 'matchingShopResults']) scope[name] = renderer('src/scripts/index.js', name, scope);
  let result = scope.matchingShopResults();
  assert.equal(result.products.length, 3);
  assert.equal(result.sites.length, 3, 'default stock filtering must not remove the empty merchant');
  scope.searchFilter.value = 'autocat:gpt-plus';
  result = scope.matchingShopResults();
  assert.equal(result.products.length, 2);
  assert.deepEqual(Array.from(result.sites, (site: any) => site.id), ['a', 'b', 'empty']);
  scope.showSoldOutFilter.checked = true;
  result = scope.matchingShopResults();
  assert.equal(result.products.length, 3);
  assert.equal(result.sites.length, 3);
  scope.merchantSearchFilter.value = 'Beta';
  result = scope.matchingShopResults();
  assert.equal(result.products.length, 1);
  assert.deepEqual(Array.from(result.sites, (site: any) => site.id), ['b']);
  scope.priceMax.value = '40';
  result = scope.matchingShopResults();
  assert.equal(result.products.length, 0);
  assert.deepEqual(Array.from(result.sites, (site: any) => site.id), ['b']);
});

test('gateway keyword/provider filtering computes inactive model matches without importing site-only constraints', () => {
  const models = { entries: [{ search: 'openai model', sort: { family: 'OpenAI' } }, { search: 'anthropic model', sort: { family: 'Anthropic' } }], filteredEntries: [] };
  const scope = { modelSearchInput: { value: 'model' }, siteFamilySelect: { value: 'openai' }, gatewayLists: { models }, gatewayProviderSlug: (value: string) => value.toLowerCase() };
  const filter = renderer('src/scripts/llm-gateway-home.js', 'filterModelEntries', scope);
  filter();
  assert.equal(models.filteredEntries.length, 1);
  scope.siteFamilySelect.value = '';
  filter();
  assert.equal(models.filteredEntries.length, 2);
  scope.modelSearchInput.value = 'absent';
  filter();
  assert.equal(models.filteredEntries.length, 0);
});
