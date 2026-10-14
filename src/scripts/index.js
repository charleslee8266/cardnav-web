import { toggleShopFavorite } from './shop-favorites.js';
import { createShopPlatformLabel, shopPlatformFromUrl } from '../shop-platform.js';
import './refresh-times.js';
import { renderFilterSummary } from './filter-summary.js';
import { leaderboardFamilyPath } from '../models/routes.js';
import { matchesShopCategory } from '../shop-filter-state.js';
import { createScoreDisplay, createRelativeTime } from '../data-display.js';
import { setTableRowSequence } from './table-sequence.js';
/*
 * 文件说明: 首页商品表格筛选、排序、收藏与商家分组懒渲染交互。
 */
import { productForAutoCategory } from '../models/product-catalog.js';
import { productIconPath } from '../models/product-icons.js';
import { autoCategoryLabel } from '../shop-auto-category.js';
import { pinSiteRows } from '../site-list-pinning.js';
import ProductMetricTracker from './ProductMetricTracker.js';
import { buildShopSearchQuery, matchesShopSearchQuery, prepareShopSearchQuery, parseStructuredPriceToCny } from '../shop-search-query.js';
import { buildShopSearchPageMeta } from '../shop-search-page-meta.js';
import {
  shopProductCategoryName,
  shopProductAutoCategory,
  shopProductInStock,
  shopProductId,
  shopProductName,
  shopProductPriceNumber,
  shopProductPriceUnit,
  shopProductRefreshedMs,
  shopProductRefreshTime,
  shopProductScore,
  shopProducts,
  shopProductsInitialLimit,
  shopProductsIsPartial,
  shopProductsTotalInStockProductCount,
  shopProductsTotalProductCount,
  shopProductSite,
  shopProductStock,
  shopProductUrl,
  shopSiteId,
  shopSitePlatformName,
  shopSiteLastRefreshMs,
  shopSiteLastRefreshTime,
  shopSiteName,
  shopSiteScore,
  shopSiteSponsor,
  shopSiteSupportTotalCents,
  shopSiteSupportPoints,
  shopSiteUrl,
  shopSites,
} from '../shop-products-data.js';
import { prioritizeShopProductRows } from '../shop-sponsored-pinning.js';

const filtersForm = document.querySelector('#filters');
const searchFilter = document.querySelector('#searchFilter');
const showSoldOutFilter = document.querySelector('#showSoldOutFilter');
const matchCategoryFilter = document.querySelector('#matchCategoryFilter');
const fuzzySearchFilter = document.querySelector('#fuzzySearchFilter');
const platformFilterGroup = document.querySelector('[data-multi-filter="platform"]');
const selectedPlatforms = () => [...(platformFilterGroup?.querySelectorAll('input:checked') || [])].map(input => input.value);
const merchantPlatformGroup = document.querySelector('[data-multi-filter="merchantPlatform"]');
const selectedMerchantPlatforms = () => [...(merchantPlatformGroup?.querySelectorAll('input:checked') || [])].map(input => input.value);
const onlyPlatformFilter = document.querySelector('#onlyPlatformFilter');
const merchantPlatformFilter = document.querySelector('#merchantPlatformFilter');
const platformOnly = () => Boolean(onlyPlatformFilter?.checked);
const merchantPlatformOnly = () => Boolean(merchantPlatformFilter?.checked);
const onlyFavoritesFilter = document.querySelector('#onlyFavoritesFilter');
const priceMin = document.querySelector('#priceMin');
const priceMax = document.querySelector('#priceMax');
const merchantFiltersForm = document.querySelector('#merchantFilters');
const merchantFavoritesFilter = document.querySelector('#merchantFavoritesFilter');
const merchantSearchFilter = document.querySelector('#merchantSearchFilter');
const quickPlanRow = document.querySelector('#quickPlanRow');
const quickPlanTips = document.querySelector('#quickPlanTips');
const officialPriceTip = document.querySelector('#officialPriceTip');
const gatewayTip = document.querySelector('#gatewayTip');
const leaderboardTip = document.querySelector('#leaderboardTip');
let shopProductsData = JSON.parse(document.querySelector('#shop-products-data')?.textContent || '{"v":1,"s":[],"c":[],"u":[],"p":[],"sc":0,"pc":0,"l":null,"x":0}');
const shopsMessages = JSON.parse(document.querySelector('#shops-messages')?.textContent || '{}');
const productEmptyState = document.querySelector('#productEmptyState');
const merchantEmptyState = document.querySelector('#merchantEmptyState');
const rowContainer = document.querySelector('#merchantRows');
const flatProductRowsContainer = document.querySelector('#flatProductRows');
const flatProductProgressiveLoad = document.querySelector('#flatProductProgressiveLoad');
const flatProductLoadSummary = document.querySelector('#flatProductLoadSummary');
const flatProductLoadMoreButton = document.querySelector('#flatProductLoadMoreButton');
const merchantProgressiveLoad = document.querySelector('#merchantProgressiveLoad');
const merchantLoadSummary = document.querySelector('#merchantLoadSummary');
const merchantLoadMoreButton = document.querySelector('#merchantLoadMoreButton');
const merchantGroupedView = document.querySelector('#merchantGroupedView');
const flatProductView = document.querySelector('#flatProductView');
const shopTabButtons = Array.from(document.querySelectorAll('[data-shop-tab]'));
const shopTabPanels = Array.from(document.querySelectorAll('[data-shop-panel]'));
const shopPageHeroTitle = document.querySelector('#shopPageHeroTitle');
const shopPageHeroDescription = document.querySelector('#shopPageHeroDescription');
const flatSortButtons = Array.from(document.querySelectorAll('.data-table-sort-button[data-shop-sort-scope="products"]'));
const merchantSortButtons = Array.from(document.querySelectorAll('.data-table-sort-button[data-shop-sort-scope="merchants"]'));
let favoriteButtons = Array.from(document.querySelectorAll('.favorite-toggle'));
const flatRows = [];
let merchantViewModule = null;
let merchantViewModulePromise = null;
const favoriteSiteStorageKey = 'cardnav.favoriteSites';
const favoriteProductStorageKey = 'cardnav.favoriteProducts';
const DEFAULT_FLAT_PRODUCT_LIMIT = 100;
const FLAT_PRODUCT_LOAD_MORE_STEP = 100;
const DEFAULT_MERCHANT_LIMIT = 20;
const MERCHANT_LOAD_MORE_STEP = 20;
let currentFlatSort = null;
let currentMerchantSort = null;
let currentFlatRows = flatRows;
let currentShopTab = 'products';
let favoriteSiteKeys = new Set();
let favoriteProductKeys = new Set();
let currentFlatVisibleLimit = shopProductsInitialLimit(shopProductsData) || DEFAULT_FLAT_PRODUCT_LIMIT;
let currentMerchantVisibleLimit = DEFAULT_MERCHANT_LIMIT;
const productMetricTracker = new ProductMetricTracker();
let isShopProductsDataLoading = false;
let shopProductsDataLoadPromise = null;
let applyFiltersTimer = null;
let searchReportTimer = null;
let umamiFilterReportTimer = null;
const SEARCH_REPORT_DELAY_MS = 5000;
const SEARCH_REPORT_DEDUP_WINDOW_MS = 2 * 60 * 1000;
let lastReportedQuery = '';
let lastReportedUmamiFilterKey = '';
const recentSearchReports = new Map();
const localizedShopsPath = shopsMessages.shopsPath || localizedFallbackPath('/shops');
let currentQuickPlanQuery = shopsMessages.seoSearchQuery || '';
let currentQuickPlanPath = shopsMessages.seoSearchPath || '';
let currentSearchPageMetaQuery = shopsMessages.seoSearchQuery || '';
let currentSearchPageMetaPath = shopsMessages.seoSearchPath || '';

function localizedFallbackPath(pathname) {
  const normalizedPathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const [, maybeLocale] = window.location.pathname.split('/');
  return ['en', 'ru'].includes(maybeLocale) ? `/${maybeLocale}${normalizedPathname}` : normalizedPathname;
}

function trackUmamiEvent(eventName, eventData = {}, sourceElement) {
  window.CardNavTelemetry?.track(eventName, eventData, sourceElement);
}

function showShopTab(tabName, options = {}) {
  const nextTab = tabName === 'merchants' ? 'merchants' : 'products';
  const changed = currentShopTab !== nextTab;
  currentShopTab = nextTab;
  shopTabButtons.forEach(button => {
    const active = button.dataset.shopTab === nextTab;
    button.classList.toggle('tab-active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  shopTabPanels.forEach(panel => {
    panel.hidden = panel.dataset.shopPanel !== nextTab;
  });
  document.querySelectorAll('[data-shop-control]').forEach(control => { control.hidden = control.dataset.shopControl !== nextTab; });
  if (options.shouldApply !== false) {
    resetFlatVisibleLimit();
    applyFilters();
  }
  if (changed && options.track !== false) {
    trackUmamiEvent('tab-change', { scope: 'shops', tab: nextTab }, shopTabPanels.find(panel => panel.dataset.shopPanel === nextTab));
  }
}

function normalize(value) {
  return (value || '').trim().toLowerCase();
}

function currentSearchFieldOptions() {
  return {
    matchCategory: Boolean(matchCategoryFilter?.checked),
    matchMerchant: false,
    fuzzy: Boolean(fuzzySearchFilter?.checked),
  };
}

function buildActiveSearchQuery(value) {
  return buildShopSearchQuery(value);
}

function matchesSearchQuery(rowEntry, query) {
  return matchesShopSearchQuery(rowEntry, query, currentSearchFieldOptions());
}

function matchesMerchantFilters(name, url, id) {
  const query = normalize(merchantSearchFilter?.value || '');
  return (!query || normalize(`${name} ${url}`).includes(query))
    && (!merchantFavoritesFilter?.checked || favoriteSiteKeys.has(id));
}

function matchingShopResults() {
  const products = searchMatchedFlatRows();
  const merchantPlatforms = selectedMerchantPlatforms();
  const sites = shopSites(shopProductsData).filter(site => {
    const id = text(shopSiteId(site));
    return matchesMerchantFilters(text(shopSiteName(site)), text(shopSiteUrl(site)), id)
      && (!merchantPlatformOnly() || Boolean(shopSitePlatformName(site)))
      && (!merchantPlatforms.length || merchantPlatforms.includes(shopSitePlatformName(site) || 'self-hosted'));
  });
  return { products, sites };
}

function searchMatchedFlatRows() {
  const query = buildActiveSearchQuery(searchFilter?.value || '');
  const categoryId = selectedQuickCategoryId();
  const platforms = selectedPlatforms();
  const matchedRows = flatRows.filter(rowEntry => {
    const showSoldOut = Boolean(showSoldOutFilter?.checked);
    const priceMinValue = priceMin?.value.trim() || '';
    const priceMaxValue = priceMax?.value.trim() || '';
    const minPrice = parseBound(priceMinValue);
    const maxPrice = parseBound(priceMaxValue);
    const stockMatched = showSoldOut || rowEntry.inStock === 1;
    const priceMatched = matchesPriceRange(rowEntry.priceValue, minPrice, maxPrice);
    const queryMatched = matchesSearchQuery(rowEntry, query) && matchesShopCategory(rowEntry.autoCategory, categoryId);
    const favoriteMatched = !onlyFavoritesFilter?.checked || favoriteProductKeys.has(rowEntry.productFavoriteKey) || favoriteSiteKeys.has(rowEntry.siteFavoriteKey);
    return (!platformOnly() || rowEntry.platformHosted) && (!platforms.length || platforms.includes(rowEntry.platformHosted ? rowEntry.platformName : 'self-hosted')) && stockMatched && priceMatched && queryMatched && favoriteMatched;
  });
  return prioritizeFavoriteFlatRows(matchedRows);
}

function loadFavoriteKeys(storageKey) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(parsed) ? new Set(parsed.filter(key => typeof key === 'string')) : new Set();
  } catch (_error) {
    return new Set();
  }
}

function text(value) {
  return String(value ?? '');
}

function appendTextElement(parent, tagName, className, value) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = value;
  parent.appendChild(element);
  return element;
}

function renderFavoriteButton(button, isFavorite, favoriteKind) {
  const icon = button.querySelector('span');
  const row = favoriteKind === 'site' ? button.closest('.merchant-row') : button.closest('.flat-product-row');
  button.setAttribute('aria-pressed', String(isFavorite));
  button.setAttribute('title', isFavorite
    ? (favoriteKind === 'site' ? shopsMessages.cancelMerchantFavorite || 'Unfavorite merchant' : shopsMessages.cancelProductFavorite || 'Unfavorite product')
    : (favoriteKind === 'site' ? shopsMessages.merchantFavorite || 'Favorite merchant' : shopsMessages.productFavorite || 'Favorite product'));
  if (row) row.dataset.favorite = isFavorite ? '1' : '0';
  if (icon) icon.textContent = isFavorite ? '♥' : '♡';
}

function initializeFavoriteButton(button) {
  if (button.dataset.favoriteInitialized === '1') return;
  button.dataset.favoriteInitialized = '1';
  const key = button.dataset.favoriteKey;
  const favoriteKind = button.dataset.favoriteKind || 'site';
  const favoriteKeys = favoriteKind === 'product' ? favoriteProductKeys : favoriteSiteKeys;
  renderFavoriteButton(button, favoriteKeys.has(key), favoriteKind);
  button.addEventListener('click', async () => {
    if (!key) return;
    try { await toggleShopFavorite(favoriteKind, key, button.closest('[data-product-metric-id]')?.dataset.productMetricId); } catch { return; }
    const nextFavorite = (favoriteKind === 'product' ? favoriteProductKeys : favoriteSiteKeys).has(key);
    trackUmamiEvent('favorite-change', {
      scope: 'shops',
      kind: favoriteKind,
      key,
      action: nextFavorite ? 'add' : 'remove',
    }, button);

  });
}

function initializeFavorites(buttons = favoriteButtons) {
  buttons.forEach(button => {
    const key = button.dataset.favoriteKey;
    const favoriteKind = button.dataset.favoriteKind || 'site';
    const favoriteKeys = favoriteKind === 'product' ? favoriteProductKeys : favoriteSiteKeys;
    renderFavoriteButton(button, favoriteKeys.has(key), favoriteKind);
    initializeFavoriteButton(button);
  });
}

function loadFavorites() {
  favoriteSiteKeys = loadFavoriteKeys(favoriteSiteStorageKey);
  favoriteProductKeys = loadFavoriteKeys(favoriteProductStorageKey);
}

function formatDisplayPrice(priceNumber, priceUnit) {
  if (typeof priceNumber !== 'number' || !Number.isFinite(priceNumber)) return '';
  const unit = typeof priceUnit === 'string' ? priceUnit : '';
  return `${unit}${String(priceNumber)}`;
}

function prioritizeFavoriteFlatRows(rowEntries) {
  return prioritizeShopProductRows(rowEntries, {
    favoriteProductKeys,
    favoriteSiteKeys,
  }, (row, kind) => { row.pinKind = kind; });
}

function parseBound(value) {
  const text = String(value).trim();
  if (!text) return null;
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0) return null;
  return number;
}

function priceValueForSort(priceNumber, priceUnit) {
  const price = parseStructuredPriceToCny(priceNumber, priceUnit);
  return price === null ? -1 : price;
}

function productStockNumber(product) {
  const stock = Number(shopProductStock(product));
  return Number.isFinite(stock) && stock > 0 ? stock : null;
}

function productStockLabel(product, options = {}) {
  const stock = productStockNumber(product);
  if (stock !== null) return options.prefix ? `${options.prefix}${stock}` : String(stock);
  return shopProductInStock(product) ? (shopsMessages.inStock || 'In stock') : (shopsMessages.soldOut || 'Out of stock');
}

function productStockValue(product) {
  return productStockNumber(product) ?? (shopProductInStock(product) ? 1 : 0);
}

function buildFlatRows() {
  flatRows.length = 0;
  const products = shopProducts(shopProductsData);

  products.forEach((product, index) => {
    const site = shopProductSite(shopProductsData, product);
    const siteId = text(shopSiteId(site));
    const siteName = text(shopSiteName(site));
    const siteUrl = text(shopSiteUrl(site)).trim();
    const categoryName = text(shopProductCategoryName(shopProductsData, product));
    const productName = text(shopProductName(product));
    const productTitle = `${categoryName}-${productName}`;
    const priceNumber = shopProductPriceNumber(product);
    const priceUnit = shopProductPriceUnit(shopProductsData, product);
    const priceText = formatDisplayPrice(priceNumber, priceUnit);
    const autoCategory = shopProductAutoCategory(product);
    flatRows.push({
      siteId,
      platformHosted: Boolean(shopSitePlatformName(site)),
      platformName: shopSitePlatformName(site) || shopsMessages.selfHosted,
      siteFavoriteKey: siteId || siteName,
      siteName: siteName.toLowerCase(),
      siteText: siteName.toLowerCase(),
      siteUrl: siteUrl.toLowerCase(),
      categoryName: categoryName.toLowerCase(),
      autoCategory,
      autoCategoryName: autoCategoryLabel(autoCategory, document.documentElement.lang),
      productName: productName.toLowerCase(),
      productTitle: `${categoryName} ${productName} ${productTitle}`.toLowerCase(),
      productFavoriteKey: `${siteName}#${productTitle}`,
      priceText,
      priceNumber,
      priceUnit,
      priceValue: priceValueForSort(priceNumber, priceUnit),
      sequence: index + 1,
      stockValue: productStockValue(product),
      inStock: shopProductInStock(product) ? 1 : 0,
      score: shopProductScore(product),
      siteScore: shopSiteScore(site),
      sponsor: shopSiteSponsor(site),
      supportTotalCents: shopSiteSupportTotalCents(site),
      supportPoints: shopSiteSupportPoints(site),
      productRefreshedAt: shopProductRefreshedMs(product) || 0,
      product,
      element: null,
      indexCell: null,
      originalIndex: index,
    });
  });
  flatRows.sort((left, right) => right.score - left.score
    || right.siteScore - left.siteScore
    || right.inStock - left.inStock
    || right.productRefreshedAt - left.productRefreshedAt
    || left.categoryName.localeCompare(right.categoryName)
    || left.productName.localeCompare(right.productName));
  flatRows.forEach((row, index) => {
    row.sequence = index + 1;
    row.originalIndex = index;
  });
}

function matchesPriceRange(priceValue, min, max) {
  if (min === null && max === null) return true;
  if (typeof priceValue !== 'number' || priceValue < 0) return false;

  if (min !== null && priceValue < min) return false;
  if (max !== null && priceValue > max) return false;
  return true;
}

function syncFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  searchFilter.value = params.get('q') || '';
  const buttons = [...quickPlanRow.querySelectorAll('[data-quick-plan-query]')];
  const pathButton = buttons.find(button => button.dataset.quickPlanPath === window.location.pathname);
  const initialSeoPage = window.location.pathname === shopsMessages.seoSearchPath;
  currentQuickPlanPath = pathButton?.dataset.quickPlanPath || (initialSeoPage ? shopsMessages.seoSearchPath : '');
  currentQuickPlanQuery = pathButton?.dataset.quickPlanQuery || (initialSeoPage ? shopsMessages.seoSearchQuery : '') || (params.get('category') ? `autocat: ${params.get('category')}` : '');
  if (pathButton) {
    applySearchPageMeta(pathButton.dataset.quickPlanDisplayName, currentQuickPlanQuery, currentQuickPlanPath, pathButton.dataset.quickPlanHeroName);
    showOfficialPriceTip(pathButton, currentQuickPlanQuery);
    showGatewayTip(pathButton, currentQuickPlanQuery);
  } else { hideOfficialPriceTip(); hideGatewayTip(); }
  merchantSearchFilter.value = params.get('merchantQ') || '';
  merchantFavoritesFilter.checked = params.get('merchantFavorites') === '1';
  if (onlyPlatformFilter) onlyPlatformFilter.checked = params.get('platformOnly') === '1';
  platformFilterGroup?.querySelectorAll('input').forEach(input => { input.checked = params.getAll('platform').map(shopPlatformFromUrl).includes(input.value); });
  merchantPlatformGroup?.querySelectorAll('input').forEach(input => { input.checked = params.getAll('merchantPlatform').map(shopPlatformFromUrl).includes(input.value); });
  if (merchantPlatformFilter) merchantPlatformFilter.checked = params.get('merchantPlatformOnly') === '1';
  if (onlyFavoritesFilter) onlyFavoritesFilter.checked = params.get('favorites') === '1';
  if (showSoldOutFilter) showSoldOutFilter.checked = params.get('showSoldOut') === '1';
  priceMin.value = params.get('priceMin') || '';
  priceMax.value = params.get('priceMax') || '';
  if (matchCategoryFilter) matchCategoryFilter.checked = params.get('matchCategory') === '1';
  if (fuzzySearchFilter) fuzzySearchFilter.checked = params.get('fuzzy') === '1';
  showShopTab(params.get('tab'), { shouldApply: false, track: false });
}

function reportSearchTerm(term, resultCount) {
  const normalizedTerm = normalize(term);
  const safeResultCount = Number.isFinite(resultCount) ? Math.max(0, Math.floor(resultCount)) : 0;
  if (!normalizedTerm || normalizedTerm.length < 2) return;
  if (/^https?:\/\//i.test(normalizedTerm) || /\/shop\//i.test(normalizedTerm) || /[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(normalizedTerm)) return;
  const dedupKey = normalizedTerm;
  const now = Date.now();
  const lastReportedAt = recentSearchReports.get(dedupKey) || 0;
  if (now - lastReportedAt < SEARCH_REPORT_DEDUP_WINDOW_MS) return;
  recentSearchReports.set(dedupKey, now);

  fetch('/api/search-terms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ term: normalizedTerm, resultCount: safeResultCount }),
    keepalive: true,
  }).catch(() => {});
}

function reportProductClick(payload) {
  if (!productMetricTracker.markClick(payload.productId)) return;
  const siteId = normalize(payload.siteId);
  const productUrl = text(payload.productUrl).trim();
  const categoryName = text(payload.categoryName).trim();
  const name = text(payload.name).trim();
  if (!siteId) return;
  if (!productUrl && (!categoryName || !name)) return;

  fetch('/api/product-clicks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      siteId,
      visitorId: productMetricTracker.visitorId,
      productUrl,
      categoryName,
      name,
    }),
    keepalive: true,
  }).catch(() => {});
}

function scheduleSearchReport() {
  clearTimeout(searchReportTimer);
  const query = searchFilter?.value.trim() || '';
  const reportQuery = prepareShopSearchQuery(query);
  if (reportQuery.length < 2 || reportQuery === lastReportedQuery) return;
  searchReportTimer = setTimeout(() => {
    lastReportedQuery = reportQuery;
    reportSearchTerm(reportQuery, filteredFlatRows().length);
  }, SEARCH_REPORT_DELAY_MS);
}

function currentFilterEventData(reason) {
  return {
    reason,
    hasQuery: Boolean(searchFilter?.value.trim()),
    hasMerchantQuery: Boolean(merchantSearchFilter?.value.trim()),
    priceMin: priceMin?.value.trim() || '',
    priceMax: priceMax?.value.trim() || '',
    showSoldOut: showSoldOutFilter?.checked ? '1' : '0',
    tab: reason === 'merchantQuery' ? 'merchants' : 'products',
    matchCategory: matchCategoryFilter?.checked ? '1' : '0',
    fuzzy: fuzzySearchFilter?.checked ? '1' : '0',
  };
}

function scheduleFilterTrack(reason) {
  const sourceElement = reason === 'merchantQuery' ? merchantSearchFilter : searchFilter;
  clearTimeout(umamiFilterReportTimer);
  umamiFilterReportTimer = setTimeout(() => {
    const eventData = currentFilterEventData(reason);
    const eventKey = JSON.stringify({ ...eventData, query: searchFilter?.value.trim(), merchantQuery: merchantSearchFilter?.value.trim() });
    if (eventKey === lastReportedUmamiFilterKey) return;
    lastReportedUmamiFilterKey = eventKey;
    trackUmamiEvent('filter-change', { scope: 'shops', ...eventData }, sourceElement);
  }, 700);
}

function scheduleApplyFilters() {
  clearTimeout(applyFiltersTimer);
  applyFiltersTimer = setTimeout(applyFilters, 180);
}

function resetFlatVisibleLimit() {
  currentFlatVisibleLimit = DEFAULT_FLAT_PRODUCT_LIMIT;
  currentMerchantVisibleLimit = DEFAULT_MERCHANT_LIMIT;
}

function shouldResetSearchPageMeta() {
  return Boolean(
    currentSearchPageMetaQuery
      && (!currentQuickPlanPath || currentQuickPlanPath !== currentSearchPageMetaPath || currentQuickPlanQuery !== currentSearchPageMetaQuery),
  );
}

function resetSearchPageMeta() {
  if (!shouldResetSearchPageMeta()) return;
  if (shopsMessages.defaultPageTitle) document.title = shopsMessages.defaultPageTitle;
  if (shopPageHeroTitle && shopsMessages.defaultHeroTitle) shopPageHeroTitle.textContent = shopsMessages.defaultHeroTitle;
  if (shopPageHeroDescription && shopsMessages.defaultHeroDescription) shopPageHeroDescription.textContent = shopsMessages.defaultHeroDescription;
  currentSearchPageMetaQuery = '';
  currentSearchPageMetaPath = '';
}

function applySearchPageMeta(termLabel, searchQuery, searchPath, heroLabel = termLabel) {
  const meta = buildShopSearchPageMeta(termLabel, {
    searchResultsTitle: shopsMessages.searchResultsTitle || '{term}',
    searchResultsDescription: shopsMessages.searchResultsDescription || '',
    titleSuffix: shopsMessages.titleSuffix || '',
  }, heroLabel);
  document.title = meta.documentTitle;
  if (shopPageHeroTitle) shopPageHeroTitle.textContent = meta.heroTitle;
  if (shopPageHeroDescription) shopPageHeroDescription.textContent = (shopsMessages.searchResultsHeroDescription || '{term}').replace('{term}', heroLabel);
  currentSearchPageMetaQuery = searchQuery;
  currentSearchPageMetaPath = searchPath;
}

function syncQuickPlanTips() {
  if (!quickPlanTips) return;
  const selected = [...quickPlanRow.querySelectorAll('[data-quick-plan-query]')].find(button => button.dataset.quickPlanQuery === currentQuickPlanQuery);
  const family = selected?.dataset.gatewayFamily;
  if (leaderboardTip) {
    leaderboardTip.classList.toggle('hidden', !family);
    if (family) {
      leaderboardTip.href = localizedFallbackPath(leaderboardFamilyPath(family));
      leaderboardTip.querySelector('span').textContent = shopsMessages.leaderboardTip.replace('{term}', selected.dataset.gatewayProductName || family);
      leaderboardTip.dataset.umamiEventUrl = leaderboardTip.getAttribute('href');
    }
  }
  const officialHidden = !officialPriceTip || officialPriceTip.classList.contains('hidden');
  const gatewayHidden = !gatewayTip || gatewayTip.classList.contains('hidden');
  quickPlanTips.classList.toggle('hidden', officialHidden && gatewayHidden && !family);
}

function hideOfficialPriceTip() {
  if (!officialPriceTip) return;
  officialPriceTip.classList.add('hidden');
  officialPriceTip.href = '#';
  const tipLabel = officialPriceTip.querySelector('[data-official-price-tip-label]');
  if (tipLabel) tipLabel.textContent = '';
  delete officialPriceTip.dataset.umamiEventUrl;
  delete officialPriceTip.dataset.umamiEventName;
  officialPriceTip.classList.remove('inline-flex');
  syncQuickPlanTips();
}

function hideGatewayTip() {
  if (!gatewayTip) return;
  gatewayTip.classList.add('hidden');
  gatewayTip.href = '#';
  const tipLabel = gatewayTip.querySelector('[data-gateway-tip-label]');
  if (tipLabel) tipLabel.textContent = '';
  delete gatewayTip.dataset.umamiEventUrl;
  delete gatewayTip.dataset.umamiEventName;
  gatewayTip.classList.remove('inline-flex');
  syncQuickPlanTips();
}

function showOfficialPriceTip(button, query) {
  if (!officialPriceTip) return;
  const officialPricePath = button.dataset.officialPricePath || '';
  const label = button.dataset.quickPlanLabel || button.textContent?.trim() || query;
  if (!officialPricePath) {
    hideOfficialPriceTip();
    return;
  }
  officialPriceTip.href = officialPricePath;
  const tipLabel = officialPriceTip.querySelector('[data-official-price-tip-label]');
  if (tipLabel) {
    tipLabel.textContent = (shopsMessages.officialPriceTip || 'View official subscription price comparison for {term}')
      .replace('{term}', label);
  }
  officialPriceTip.dataset.umamiEventUrl = officialPricePath;
  officialPriceTip.dataset.umamiEventName = label;
  officialPriceTip.classList.add('inline-flex');
  officialPriceTip.classList.remove('hidden');
  syncQuickPlanTips();
}

function showGatewayTip(button, query) {
  if (!gatewayTip) return;
  const gatewayPath = button.dataset.gatewayPath || '';
  const label = (button.dataset.gatewayProductName || button.textContent || query).trim();
  if (!gatewayPath) {
    hideGatewayTip();
    return;
  }
  gatewayTip.href = gatewayPath;
  const tipLabel = gatewayTip.querySelector('[data-gateway-tip-label]');
  if (tipLabel) {
    tipLabel.textContent = (shopsMessages.gatewayTip || 'View gateway sites that support {term}')
      .replace('{term}', label);
  }
  gatewayTip.dataset.umamiEventUrl = gatewayPath;
  gatewayTip.dataset.umamiEventName = label;
  gatewayTip.classList.add('inline-flex');
  gatewayTip.classList.remove('hidden');
  syncQuickPlanTips();
}

function shopProductsDataIsPartial() {
  return shopProductsIsPartial(shopProductsData);
}

function loadedProductCount() {
  return shopProducts(shopProductsData).length;
}

function totalProductCount() {
  return showSoldOutFilter?.checked
    ? shopProductsTotalProductCount(shopProductsData)
    : shopProductsTotalInStockProductCount(shopProductsData);
}

function totalSiteCount() {
  return Number(shopProductsData.sc) || shopSites(shopProductsData).length;
}

function hasActiveProductFilters() {
  return Boolean(
    (searchFilter?.value || '').trim()
    || currentQuickPlanQuery
    || onlyFavoritesFilter?.checked
    || platformOnly()
    || selectedPlatforms().length
    || showSoldOutFilter?.checked
    || matchCategoryFilter?.checked
    || (fuzzySearchFilter?.checked && searchFilter?.value.trim())
    || priceMin?.value.trim()
    || priceMax?.value.trim()
  );
}

function hasActiveMerchantFilters() {
  return Boolean((merchantSearchFilter?.value || '').trim() || merchantFavoritesFilter?.checked || merchantPlatformOnly() || selectedMerchantPlatforms().length);
}

function shouldLoadFullShopProductsData(options = {}) {
  if (!shopProductsDataIsPartial()) return false;
  return Boolean(
    options.force
    || onlyFavoritesFilter?.checked
    || platformOnly()
    || selectedPlatforms().length
    || options.merchantTab
    || options.searchQuery
    || currentQuickPlanQuery
    || options.showSoldOut
    || options.matchCategory
    || options.fuzzy
    || options.priceMinValue
    || options.priceMaxValue
    || currentFlatVisibleLimit > loadedProductCount()
  );
}

function createFavoriteButton(favoriteKind, key, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'favorite-toggle';
  button.dataset.favoriteKind = favoriteKind;
  button.dataset.favoriteKey = key;
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-pressed', 'false');
  button.title = favoriteKind === 'site' ? (shopsMessages.merchantFavorite || 'Favorite merchant') : (shopsMessages.productFavorite || 'Favorite product');
  appendTextElement(button, 'span', '', '♡').setAttribute('aria-hidden', 'true');
  return button;
}

function sponsoredRel(sponsored) {
  return sponsored ? 'noopener noreferrer sponsored' : 'noopener noreferrer';
}

function createTrackedProductLink(href, className, label, eventLabel, options = {}) {
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = sponsoredRel(options.sponsor);
  link.dataset.umamiEvent = 'external-link-click';
  link.dataset.umamiEventLinkType = 'product';
  link.dataset.umamiEventUrl = href;
  link.dataset.umamiEventName = eventLabel;
  link.className = className;
  link.textContent = label;
  return link;
}

function createTrackedMerchantLink(href, label, options = {}) {
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = sponsoredRel(options.sponsor);
  link.dataset.umamiEvent = 'external-link-click';
  link.dataset.umamiEventLinkType = 'merchant';
  link.dataset.umamiEventUrl = href;
  link.dataset.umamiEventName = label;
  link.className = 'merchant-link merchant-text';
  link.textContent = label;
  return link;
}

function tableLabel(key) {
  return shopsMessages.tableLabels?.[key] || '';
}

function createFlatProductRow(item) {
  const site = shopProductSite(shopProductsData, item);
  const siteId = text(shopSiteId(site));
  const siteName = text(shopSiteName(site));
  const siteUrl = text(shopSiteUrl(site)).trim();
  const siteSponsor = shopSiteSponsor(site);
  const categoryName = text(shopProductCategoryName(shopProductsData, item));
  const productName = text(shopProductName(item));
  const productTitle = `${categoryName}-${productName}`;
  const productFavoriteKey = `${siteName}#${productTitle}`;
  const siteFavoriteKey = siteId || siteName;
  const productUrl = shopProductUrl(item);
  const priceNumber = shopProductPriceNumber(item);
  const priceUnit = shopProductPriceUnit(shopProductsData, item);
  const inStock = shopProductInStock(item);
  const row = document.createElement('tr');
  row.className = 'flat-product-row';

  const indexCell = appendTextElement(row, 'th', 'flat-row-index data-table-sequence-cell', '');
  indexCell.scope = 'row';
  indexCell.setAttribute('data-label', tableLabel('sequence'));

  const productCell = document.createElement('td');
  productCell.className = 'flat-product-cell';
  productCell.setAttribute('data-label', tableLabel('product'));
  const productInline = document.createElement('div');
  productInline.className = 'merchant-header';
  productInline.appendChild(createFavoriteButton('product', productFavoriteKey, `${shopsMessages.productFavorite || 'Favorite product'} ${productTitle}`));
  const productContent = document.createElement('div');
  productContent.className = 'merchant-header-content';
  const productTitleRow = document.createElement('div');
  productTitleRow.className = 'merchant-title-row';
  if (productUrl) {
    const productLink = createTrackedProductLink(productUrl, 'product-link', productName, productTitle, { sponsor: siteSponsor || shopSiteSupportTotalCents(site) > 0 });
    productLink.dataset.rowPrimary = '';
    productLink.dataset.productClickSiteId = siteId;
    productLink.dataset.productClickUrl = productUrl;
    productLink.dataset.productClickCategory = categoryName;
    productLink.dataset.productClickName = productName;
    productTitleRow.appendChild(productLink);
  } else {
    appendTextElement(productTitleRow, 'span', 'product-text', productName);
  }
  productContent.appendChild(productTitleRow);
  const productTags = document.createElement('div');
  productTags.className = 'merchant-tag-row';
  if (siteSponsor) productTags.appendChild(window.CardNavMerchantBadge.create(shopsMessages.sponsorLabel || 'Partner', shopsMessages.sponsorDescription || '', shopsMessages.partnershipUrl || localizedFallbackPath('/partnership'), shopsMessages.partnershipLinkLabel || 'How to partner'));
  if (shopSiteSupportTotalCents(site) > 0) productTags.appendChild(window.CardNavMerchantBadge.create(shopsMessages.supportLabel, shopsMessages.supportDescription, shopsMessages.supportersUrl, shopsMessages.supportLinkLabel, 'support'));
  if (productTags.childElementCount > 0) productTitleRow.append(...productTags.childNodes);
  productInline.appendChild(productContent);

  productCell.appendChild(productInline);
  row.appendChild(productCell);

  const priceCell = document.createElement('td');
  priceCell.className = 'flat-price-cell data-table-cell-align-right';
  priceCell.setAttribute('data-label', tableLabel('price'));
  priceCell.appendChild(document.createTextNode(formatDisplayPrice(priceNumber, priceUnit)));
  row.appendChild(priceCell);

  const statusCell = document.createElement('td');
  statusCell.className = 'flat-status-cell data-table-cell-align-right';
  statusCell.setAttribute('data-label', tableLabel('stock'));
  appendTextElement(
    statusCell,
    'span',
    inStock ? 'stock-badge-in-stock' : 'stock-badge-sold-out',
    productStockLabel(item),
  );
  row.appendChild(statusCell);

  const categoryLine = appendTextElement(productContent, 'div', 'flat-category-line', '');
  if (categoryName) {
    const originalCategory = appendTextElement(categoryLine, 'span', 'flat-category-label', categoryName);
    originalCategory.title = tableLabel('category');
  }
  const autoCategory = shopProductAutoCategory(item);
  const categoryProduct = productForAutoCategory(autoCategory);
  const categoryGroup = appendTextElement(categoryLine, 'span', 'auto-category-label-group', '');
  const categoryContent = appendTextElement(categoryGroup, 'button', 'auto-category-content flat-category-button', '');
  categoryContent.type = 'button';
  categoryContent.dataset.filterAutoCategory = autoCategory;
  categoryContent.title = shopsMessages.autoCategoryTip;
  if (categoryProduct?.icon) {
    const icon = document.createElement('img');
    icon.src = productIconPath(categoryProduct.icon);
    icon.alt = '';
    icon.width = 14;
    icon.height = 14;
    icon.className = categoryProduct.monochrome ? 'auto-category-icon auto-category-icon-mono' : 'auto-category-icon';
    categoryContent.appendChild(icon);
  }
  appendTextElement(categoryContent, 'span', '', autoCategoryLabel(autoCategory, document.documentElement.lang));
  const categoryHelp = appendTextElement(categoryGroup, 'button', 'inline-help-button', 'i');
  categoryHelp.type = 'button'; categoryHelp.dataset.inlineHelp = '';
  categoryHelp.dataset.tip = shopsMessages.autoCategoryTip;
  categoryHelp.setAttribute('aria-label', shopsMessages.autoCategoryTip);

  const productScoreCell = document.createElement('td');
  productScoreCell.className = 'data-table-product-score-cell data-table-cell-align-right';
  productScoreCell.setAttribute('data-label', tableLabel('productScore'));
  productScoreCell.appendChild(createScoreDisplay(shopProductScore(item)));
  row.appendChild(productScoreCell);

  const platformCell = appendTextElement(row, 'td', 'flat-platform-cell', '');
  platformCell.appendChild(createPlatformSelection(shopSitePlatformName(site), 'products'));
  platformCell.setAttribute('data-label', tableLabel('platform'));

  const merchantCell = document.createElement('td');
  merchantCell.className = 'flat-merchant-cell';
  merchantCell.setAttribute('data-label', tableLabel('merchant'));
  const merchantInline = document.createElement('div');
  merchantInline.className = 'cell-inline';
  merchantInline.appendChild(createFavoriteButton('site', siteFavoriteKey, `${shopsMessages.merchantFavorite || 'Favorite merchant'} ${siteName}`));
  const merchantCopy = document.createElement('div');
  merchantCopy.className = 'merchant-header-content';
  merchantInline.appendChild(merchantCopy);
  if (siteUrl) {
    merchantCopy.appendChild(createTrackedMerchantLink(siteUrl, siteName, { sponsor: siteSponsor || shopSiteSupportTotalCents(site) > 0 }));
  } else {
    appendTextElement(merchantCopy, 'span', 'merchant-text', siteName);
  }

  merchantCell.appendChild(merchantInline);
  row.appendChild(merchantCell);

  if (shopSiteSupportPoints(site) > 0) {
    const support = appendTextElement(merchantCopy, 'div', 'data-support-inline', `${shopsMessages.supportTotalLabel} `);
    appendTextElement(support, 'strong', '', shopSiteSupportPoints(site).toLocaleString(undefined, { maximumFractionDigits: 2 }));
  }

  const refreshCell = document.createElement('td');
  refreshCell.className = 'flat-refresh-cell';
  refreshCell.setAttribute('data-label', tableLabel('latestRefresh'));
  refreshCell.appendChild(createRelativeTime(shopProductRefreshedMs(item)));
  row.appendChild(refreshCell);

  return row;
}

function updateFlatProgressiveLoadSummary(visibleCount, renderedCount) {
  if (!flatProductLoadSummary || !flatProductLoadMoreButton || !flatProductProgressiveLoad) return;
  if (currentShopTab !== 'products') {
    flatProductProgressiveLoad.classList.add('hidden');
    flatProductLoadSummary.classList.add('hidden');
    flatProductLoadMoreButton.classList.add('hidden');
    return;
  }

  if (isShopProductsDataLoading) {
    flatProductProgressiveLoad.classList.remove('hidden');
    flatProductLoadSummary.classList.remove('hidden');
    flatProductLoadSummary.textContent = shopsMessages.loading || 'Loading';
    flatProductLoadMoreButton.classList.add('hidden');
    return;
  }

  const totalVisibleCount = hasActiveProductFilters() ? visibleCount : totalProductCount();
  const tabCount = document.querySelector('[data-shop-tab="products"] .tool-tab-badge');
  if (tabCount) tabCount.textContent = String(totalVisibleCount);

  if (visibleCount === 0) {
    flatProductProgressiveLoad.classList.add('hidden');
    flatProductLoadSummary.classList.add('hidden');
    flatProductLoadMoreButton.classList.add('hidden');
    return;
  }

  flatProductProgressiveLoad.classList.remove('hidden');
  flatProductLoadSummary.classList.remove('hidden');

  flatProductLoadSummary.textContent = (shopsMessages.displaySummary || 'Showing {rendered} / {total} matching products')
    .replace('{rendered}', String(renderedCount))
    .replace('{total}', String(totalVisibleCount));

  if (renderedCount < visibleCount || shopProductsDataIsPartial()) {
    flatProductLoadMoreButton.classList.remove('hidden');
  } else {
    flatProductLoadMoreButton.classList.add('hidden');
  }
}

function updateMerchantProgressiveLoadSummary(visibleCount, renderedCount) {
  if (!merchantLoadSummary || !merchantLoadMoreButton || !merchantProgressiveLoad) return;
  if (currentShopTab !== 'merchants') {
    merchantProgressiveLoad.classList.add('hidden');
    merchantLoadSummary.classList.add('hidden');
    merchantLoadMoreButton.classList.add('hidden');
    return;
  }

  if (isShopProductsDataLoading) {
    merchantProgressiveLoad.classList.remove('hidden');
    merchantLoadSummary.classList.remove('hidden');
    merchantLoadSummary.textContent = shopsMessages.loading || 'Loading';
    merchantLoadMoreButton.classList.add('hidden');
    return;
  }

  const totalVisibleCount = hasActiveMerchantFilters() ? visibleCount : totalSiteCount();
  const tabCount = document.querySelector('[data-shop-tab="merchants"] .tool-tab-badge');
  if (tabCount) tabCount.textContent = String(totalVisibleCount);

  if (visibleCount === 0) {
    merchantProgressiveLoad.classList.add('hidden');
    merchantLoadSummary.classList.add('hidden');
    merchantLoadMoreButton.classList.add('hidden');
    return;
  }

  merchantProgressiveLoad.classList.remove('hidden');
  merchantLoadSummary.classList.remove('hidden');
  merchantLoadSummary.textContent = (shopsMessages.merchantDisplaySummary || 'Showing {rendered} / {total} matching merchants')
    .replace('{rendered}', String(renderedCount))
    .replace('{total}', String(totalVisibleCount));
  merchantLoadMoreButton.classList.toggle('hidden', renderedCount >= visibleCount);
}

async function loadMerchantViewModule() {
  if (merchantViewModule) return merchantViewModule;
  if (!merchantViewModulePromise) {
    const merchantViewScriptUrl = String(shopsMessages.merchantViewScriptUrl || '').trim();
    if (!merchantViewScriptUrl) {
      throw new Error('shops merchant view script url is unavailable');
    }
    merchantViewModulePromise = import(/* @vite-ignore */ merchantViewScriptUrl);
  }
  merchantViewModule = await merchantViewModulePromise;
  return merchantViewModule;
}

function createPlatformSelection(platformName, scope) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'shop-platform-select';
  button.append(createShopPlatformLabel(platformName, shopsMessages.selfHosted));
  button.dataset.selectPlatform = platformName || 'self-hosted';
  button.dataset.platformScope = scope;
  return button;
}

function renderMerchantViewModule(module, matchingProducts) {
  module.renderMerchantRows({
    shopProductsData,
    matchingProducts,
    shopDataAccessors: {
      shopProductCategoryName,
      shopProductInStock,
      shopProductId,
      shopProductName,
      shopProductPriceNumber,
      shopProductPriceUnit,
      shopProductRefreshedMs,
      shopProductScore,
      shopProducts,
      shopProductSite,
      shopProductStock,
      shopProductUrl,
      shopSites,
      shopSiteId,
  shopSitePlatformName,
      shopSiteLastRefreshMs,
      shopSiteLastRefreshTime,
      shopSiteName,
      shopSiteScore,
      shopSiteSponsor,
      shopSiteSupportTotalCents,
      shopSiteSupportPoints,
      shopSiteUrl,
    },
    shopsMessages,
    createScoreDisplay,
    createRelativeTime,
    createPlatformSelection,
    createFavoriteButton,
    createTrackedLink: (href, className, label, eventLabel, options = {}) => {
      const sponsor = options?.sponsor === true;
      if (className.includes('merchant')) return createTrackedMerchantLink(href, label, { sponsor });
      return createTrackedProductLink(href, className, label, eventLabel, { sponsor });
    },
    initializeFavorites,
    getFavoriteButtons: () => favoriteButtons,
    setFavoriteButtons: nextButtons => {
      favoriteButtons = nextButtons;
    },
  });
}

function updateShopFilterCounts() {
  for (const [group, selected] of [[platformFilterGroup, selectedPlatforms()], [merchantPlatformGroup, selectedMerchantPlatforms()]]) {
    const summary = group?.querySelector('[data-multi-summary]');
    if (summary) summary.textContent = selected.length ? `${summary.dataset.emptyLabel} · ${selected.length}` : summary.dataset.emptyLabel;
  }
  for (const [id, summaryId] of [['searchOptions', 'shopActiveFilters'], ['merchantOptions', 'merchantActiveFilters']]) {
    const panel = document.getElementById(id);
    const controls = [...panel.querySelectorAll('input')].map(input => ({
      input,
      label: () => input.type === 'checkbox'
        ? input.closest('label').textContent.trim()
        : `${input.getAttribute('aria-label') || input.placeholder}: ${input.value}`,
    }));
    renderFilterSummary(document.getElementById(summaryId), controls, {
      clearLabel: shopsMessages.clearFilters,
      countElement: panel.closest('[data-filter-popover]').querySelector('[data-filter-count]'),
      onChange: () => {
        resetFlatVisibleLimit();
        applyFilters();
      },
    });
  }
  syncQuickPlanTips();
}

async function applyFilters(options = {}) {
  updateShopFilterCounts();
  const merchantTabActive = currentShopTab === 'merchants';
  const productQueryValue = searchFilter?.value.trim() || '';
  for (const button of quickPlanRow?.querySelectorAll('[data-quick-plan-query]') || []) {
    button.setAttribute('aria-pressed', String(button.dataset.quickPlanQuery === currentQuickPlanQuery));
  }
  quickPlanRow?.dispatchEvent(new CustomEvent('quick-plan-query-change', { detail: currentQuickPlanQuery }));
  const showSoldOut = Boolean(showSoldOutFilter?.checked);
  const priceMinValue = priceMin?.value.trim() || '';
  const priceMaxValue = priceMax?.value.trim() || '';
  let visibleFlatProductCount = 0;
  let visibleMerchantCount = 0;
  let renderedMerchantCount = 0;

  if (shouldLoadFullShopProductsData({
    merchantTab: merchantTabActive,
    searchQuery: productQueryValue,
    force: hasActiveMerchantFilters(),
    showSoldOut,
    matchCategory: Boolean(matchCategoryFilter?.checked),
    fuzzy: Boolean(fuzzySearchFilter?.checked && productQueryValue),
    priceMinValue,
    priceMaxValue,
  })) {
    const wasPartial = shopProductsDataIsPartial();
    await loadShopProductsDataFromApi();
    if (wasPartial && !shopProductsDataIsPartial()) {
      return;
    }
  }

  const matches = matchingShopResults();
  const filtered = hasActiveProductFilters();
  const productTotal = filtered ? matches.products.length : totalProductCount();
  const merchantTotal = hasActiveMerchantFilters() || !shopProductsDataIsPartial() ? matches.sites.length : totalSiteCount();
  const productBadge = document.querySelector('[data-shop-tab="products"] .tool-tab-badge');
  const merchantBadge = document.querySelector('[data-shop-tab="merchants"] .tool-tab-badge');
  if (productBadge) productBadge.textContent = String(productTotal);
  if (merchantBadge) merchantBadge.textContent = String(merchantTotal);
  merchantGroupedView.hidden = !merchantTabActive;
  flatProductView.hidden = merchantTabActive;

  if (merchantTabActive) {
    const merchantModule = await loadMerchantViewModule();
    // Merchant previews and counts describe the merchant, independently of product filters.
    merchantModule.resetMerchantViewState();
    favoriteButtons = favoriteButtons.filter(button => button.isConnected);
    renderMerchantViewModule(merchantModule);
    const matchedSiteIds = new Set(matches.sites.map(site => text(shopSiteId(site))));
    merchantModule.getMerchantRows().forEach(({ element: row }) => {
      const count = Number(row.dataset.productCount) || 0;
      row.dataset.visibleProductCount = String(count);
      row.dataset.filterVisible = matchedSiteIds.has(row.dataset.siteId) ? '1' : '0';
    });
    const merchantRenderState = sortRows(merchantModule);
    visibleMerchantCount = merchantRenderState.visibleCount;
    renderedMerchantCount = merchantRenderState.renderedCount;
  } else {
    if (currentFlatSort) {
      sortFlatProductRows();
    } else {
      currentFlatRows = searchMatchedFlatRows();
      appendCurrentFlatRows();
      updateFlatSortButtons();
    }

    visibleFlatProductCount = currentFlatRows.length;
    const renderedFlatCount = Math.min(currentFlatVisibleLimit, currentFlatRows.length);
    updateFlatProgressiveLoadSummary(visibleFlatProductCount, renderedFlatCount);
  }

  productEmptyState?.classList.toggle('hidden', merchantTabActive || visibleFlatProductCount > 0 || isShopProductsDataLoading);
  merchantEmptyState?.classList.toggle('hidden', !merchantTabActive || visibleMerchantCount > 0 || isShopProductsDataLoading);
  if (merchantTabActive) {
    updateFlatProgressiveLoadSummary(0, 0);
    updateMerchantProgressiveLoadSummary(visibleMerchantCount, renderedMerchantCount);
  } else {
    updateMerchantProgressiveLoadSummary(0, 0);
  }
  const shouldUseCanonicalShopPath = shouldResetSearchPageMeta();
  const openDialogQuery = ['submit-dialog', 'support-dialog'].find(key => new URLSearchParams(window.location.search).has(key));
  const params = new URLSearchParams();
  {
    if (merchantTabActive) params.set('tab', 'merchants');
    if (merchantSearchFilter.value.trim()) params.set('merchantQ', merchantSearchFilter.value.trim());
    if (merchantFavoritesFilter.checked) params.set('merchantFavorites', '1');
    if (productQueryValue) params.set('q', productQueryValue);
    if (currentQuickPlanQuery && !currentQuickPlanPath) params.set('category', selectedQuickCategoryId());
    if (platformOnly()) params.set('platformOnly', '1');
    selectedPlatforms().forEach(value => params.append('platform', value));
    selectedMerchantPlatforms().forEach(value => params.append('merchantPlatform', value));
    if (merchantPlatformOnly()) params.set('merchantPlatformOnly', '1');
    if (showSoldOut) params.set('showSoldOut', '1');
    if (onlyFavoritesFilter?.checked) params.set('favorites', '1');
    if (matchCategoryFilter?.checked) params.set('matchCategory', '1');
    if (fuzzySearchFilter?.checked) params.set('fuzzy', '1');
    if (priceMinValue) params.set('priceMin', priceMinValue);
    if (priceMaxValue) params.set('priceMax', priceMaxValue);
  }
  resetSearchPageMeta();
  const nextPath = currentQuickPlanPath && !shouldUseCanonicalShopPath ? currentQuickPlanPath : localizedShopsPath;
  const serializedParams = params.toString();
  const submitDialogSuffix = openDialogQuery ? `${serializedParams ? '&' : '?'}${openDialogQuery}` : '';
  const nextUrl = `${nextPath}${serializedParams ? `?${serializedParams}` : ''}${submitDialogSuffix}`;
  history.replaceState(null, '', nextUrl);
}

function sortRows(merchantModule) {
  if (!rowContainer) return { visibleCount: 0, renderedCount: 0 };
  let visibleCount = 0;
  let renderedCount = 0;

  const sortedRows = merchantModule.getMerchantRows()
    .slice()
    .sort((a, b) => {


      if (currentMerchantSort) {
        const multiplier = currentMerchantSort.direction === 'asc' ? 1 : -1;
        const leftValue = merchantRowValue(a.element, currentMerchantSort.key, currentMerchantSort.type);
        const rightValue = merchantRowValue(b.element, currentMerchantSort.key, currentMerchantSort.type);
        if (typeof leftValue === 'number' && typeof rightValue === 'number') {
          if (leftValue !== rightValue) return (leftValue - rightValue) * multiplier;
        } else {
          const compared = String(leftValue).localeCompare(String(rightValue), 'zh-Hans-CN', { numeric: true });
          if (compared !== 0) return compared * multiplier;
        }
        return Number(a.element.dataset.originalIndex) - Number(b.element.dataset.originalIndex);
      }

      return Number(b.element.dataset.siteScore) - Number(a.element.dataset.siteScore)
        || Number(a.element.dataset.originalIndex) - Number(b.element.dataset.originalIndex);
    });
  const visibleRows = sortedRows.filter(row => row.element.dataset.filterVisible === '1');
  const pinnedRows = pinSiteRows(visibleRows.map(entry => ({ entry, sponsor: Number(entry.element.dataset.sponsor) > 0, supportTotalCents: 0, supportPoints: Number(entry.element.dataset.supportPoints) || 0, favorite: Number(entry.element.dataset.favorite) > 0 })), (row, kind) => { row.entry.element.dataset.pinKind = kind; }).map(row => row.entry);
  const hiddenRows = sortedRows.filter(row => row.element.dataset.filterVisible !== '1');
  [...pinnedRows, ...hiddenRows].forEach(({ element: row }, sortedIndex) => {
      row.dataset.sortedIndex = String(sortedIndex);
      rowContainer.appendChild(row);
      const rowVisible = row.dataset.filterVisible === '1';
      if (rowVisible) visibleCount += 1;
      const rowRendered = rowVisible && visibleCount <= currentMerchantVisibleLimit;
      row.classList.toggle('hidden', !rowRendered);
      setTableRowSequence(row, rowRendered ? visibleCount : null);
      if (rowRendered) {
        renderedCount += 1;
      }
    });

  updateMerchantSortButtons();
  return { visibleCount, renderedCount };
}

function merchantRowValue(row, key, type) {
  let value = row.dataset[key] ?? '';
  if (key === 'sequence' || key === 'rank') value = Number(row.dataset.originalIndex) + 1;
  if (key === 'productCount') value = row.dataset.visibleProductCount || row.dataset.productCount || '0';
  if (type === 'number') return Number(value) || 0;
  return value;
}

function nextSort(currentSort, button) {
  const key = button.dataset.sortKey;
  const currentDirection = currentSort?.key === key ? currentSort.direction : null;
  const direction = currentDirection === 'asc' ? 'desc' : (currentDirection === 'desc' ? null : 'asc');
  return direction ? { key, direction, type: button.dataset.sortType || 'text' } : null;
}

function flatRowValue(rowEntry, key, type) {
  const value = key === 'sequence' ? rowEntry.originalIndex + 1 : rowEntry[key] ?? '';
  if (type === 'number') return Number(value) || 0;
  return value;
}

function ensureFlatRowElement(rowEntry) {
  if (rowEntry.element) return rowEntry.element;
  const row = createFlatProductRow(rowEntry.product);
  rowEntry.element = row;
  rowEntry.indexCell = row.querySelector('.flat-row-index');
  const newFavoriteButtons = Array.from(row.querySelectorAll('.favorite-toggle'));
  favoriteButtons = Array.from(new Set([...favoriteButtons, ...newFavoriteButtons]));
  initializeFavorites(newFavoriteButtons);
  return row;
}

function appendCurrentFlatRows() {
  if (!flatProductRowsContainer) return;
  const fragment = document.createDocumentFragment();
  currentFlatRows.slice(0, currentFlatVisibleLimit).forEach((rowEntry, index) => {
    const row = ensureFlatRowElement(rowEntry);
    row.dataset.pinKind = rowEntry.pinKind || '';
    row.dataset.productMetricId = shopProductId(rowEntry.product);
    row.dataset.productMetricScene = searchFilter?.value.trim() ? 'search' : 'default';
    row.dataset.productMetricDisplayType = favoriteProductKeys.has(rowEntry.productFavoriteKey)
      ? 'favorite'
      : rowEntry.sponsor ? 'partner' : rowEntry.supportPoints > 0 ? 'support' : 'normal';
    row.dataset.productMetricPositionBucket = index < 5 ? '1-5' : index < 20 ? '6-20' : '21+';
    row.classList.remove('hidden');
    setTableRowSequence(row, index + 1);
    fragment.appendChild(row);
  });
  flatProductRowsContainer.replaceChildren(fragment);
  flatProductRowsContainer.querySelectorAll('[data-product-metric-id]').forEach(row => productMetricTracker.observe(row));
}

function filteredFlatRows() {
  return searchMatchedFlatRows();
}

function sortFlatProductRows(button) {
  if (button) {
    const key = button.dataset.sortKey;
    const currentDirection = currentFlatSort?.key === key ? currentFlatSort.direction : null;
    const direction = currentDirection === 'asc' ? 'desc' : (currentDirection === 'desc' ? null : 'asc');
    currentFlatSort = direction ? { key, direction, type: button.dataset.sortType || 'text' } : null;
  }

  const sortedRows = filteredFlatRows().slice();
  if (currentFlatSort) {
    const multiplier = currentFlatSort.direction === 'asc' ? 1 : -1;
    sortedRows.sort((left, right) => {
      if (currentFlatSort.key === 'priceValue') {
        const leftMissing = typeof left.priceValue !== 'number' || left.priceValue < 0;
        const rightMissing = typeof right.priceValue !== 'number' || right.priceValue < 0;
        if (leftMissing && !rightMissing) return 1;
        if (!leftMissing && rightMissing) return -1;
        if (leftMissing && rightMissing) return left.originalIndex - right.originalIndex;
      }
      const leftValue = flatRowValue(left, currentFlatSort.key, currentFlatSort.type);
      const rightValue = flatRowValue(right, currentFlatSort.key, currentFlatSort.type);
      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        return (leftValue - rightValue) * multiplier;
      }
      return String(leftValue).localeCompare(String(rightValue), 'zh-Hans-CN', { numeric: true }) * multiplier;
    });
  }

  currentFlatRows = prioritizeFavoriteFlatRows(sortedRows);
  appendCurrentFlatRows();
  const renderedFlatCount = Math.min(currentFlatVisibleLimit, currentFlatRows.length);
  updateFlatProgressiveLoadSummary(currentFlatRows.length, renderedFlatCount);
  updateFlatSortButtons();
}

function updateFlatSortButtons() {
  flatSortButtons.forEach(button => {
    const active = currentFlatSort?.key === button.dataset.sortKey;
    const headerCell = button.closest('th');
    const indicator = headerCell?.querySelector('.data-table-sort-indicator') || button.querySelector('.data-table-sort-indicator');
    const status = button.querySelector('.data-table-sort-status');
    const directionLabel = currentFlatSort?.direction === 'asc' ? (shopsMessages.ascending || 'ascending') : (shopsMessages.descending || 'descending');
    if (headerCell) headerCell.setAttribute('aria-sort', active ? (currentFlatSort.direction === 'asc' ? 'ascending' : 'descending') : 'none');
    if (headerCell) headerCell.dataset.sortDirection = active ? currentFlatSort.direction : '';
    button.dataset.sortDirection = active ? currentFlatSort.direction : '';
    if (indicator) indicator.dataset.sortDirection = active ? currentFlatSort.direction : '';
    if (status) status.textContent = active
      ? (shopsMessages.currentSort || ', current {direction}').replace('{direction}', directionLabel)
      : (shopsMessages.clickSort || ', click to sort');
  });
}

function updateMerchantSortButtons() {
  merchantSortButtons.forEach(button => {
    const active = currentMerchantSort?.key === button.dataset.sortKey;
    const headerCell = button.closest('.data-table-head-cell-sortable');
    const indicator = headerCell?.querySelector('.data-table-sort-indicator') || button.querySelector('.data-table-sort-indicator');
    const status = button.querySelector('.data-table-sort-status');
    const directionLabel = currentMerchantSort?.direction === 'asc' ? (shopsMessages.ascending || 'ascending') : (shopsMessages.descending || 'descending');
    if (headerCell) headerCell.setAttribute('aria-sort', active ? (currentMerchantSort.direction === 'asc' ? 'ascending' : 'descending') : 'none');
    if (headerCell) headerCell.dataset.sortDirection = active ? currentMerchantSort.direction : '';
    button.dataset.sortDirection = active ? currentMerchantSort.direction : '';
    if (indicator) indicator.dataset.sortDirection = active ? currentMerchantSort.direction : '';
    if (status) status.textContent = active
      ? (shopsMessages.currentSort || ', current {direction}').replace('{direction}', directionLabel)
      : (shopsMessages.clickSort || ', click to sort');
  });
}

function replaceShopProductsData(nextShopProductsData) {
  if (!nextShopProductsData || !Array.isArray(nextShopProductsData.p) || !Array.isArray(nextShopProductsData.s)) return;

  shopProductsData = {
    ...nextShopProductsData,
    x: 0,
  };
  isShopProductsDataLoading = false;
  if (merchantViewModule) {
    merchantViewModule.resetMerchantViewState();
  }
  buildFlatRows();
  currentFlatRows = flatRows;
  if (flatProductRowsContainer) flatProductRowsContainer.replaceChildren();
  favoriteButtons = [];
  applyFilters();
}

async function loadShopProductsDataFromApi() {
  if (!shopProductsDataIsPartial()) return;
  if (shopProductsDataLoadPromise) return shopProductsDataLoadPromise;

  shopProductsDataLoadPromise = (async () => {
    isShopProductsDataLoading = true;
    updateFlatProgressiveLoadSummary(0, 0);
    updateMerchantProgressiveLoadSummary(0, 0);
    productEmptyState?.classList.add('hidden');
    merchantEmptyState?.classList.add('hidden');
    try {
      const response = await fetch('/api/shop-products.json', { headers: { accept: 'application/json' } });
      if (!response.ok) {
        isShopProductsDataLoading = false;
        await applyFilters();
        return;
      }
      isShopProductsDataLoading = false;
      replaceShopProductsData(await response.json());
    } catch (_error) {
      isShopProductsDataLoading = false;
      await applyFilters();
      // SSR rows remain usable when the API request fails.
    } finally {
      shopProductsDataLoadPromise = null;
    }
  })();

  return shopProductsDataLoadPromise;
}

filtersForm?.addEventListener('submit', event => {
  event.preventDefault();
  resetFlatVisibleLimit();
  scheduleSearchReport();
  applyFilters();
});
searchFilter.addEventListener('input', () => {
  resetFlatVisibleLimit();
  scheduleSearchReport();
  scheduleFilterTrack('query');
  scheduleApplyFilters();
});
merchantFiltersForm?.addEventListener('submit', event => {
  event.preventDefault();
  currentMerchantVisibleLimit = DEFAULT_MERCHANT_LIMIT;
  applyFilters();
});
merchantSearchFilter?.addEventListener('input', () => {
  currentMerchantVisibleLimit = DEFAULT_MERCHANT_LIMIT;
  scheduleFilterTrack('merchantQuery');
  scheduleApplyFilters();
});
for (const control of [onlyPlatformFilter, merchantPlatformFilter]) control?.addEventListener('change', () => { resetFlatVisibleLimit(); applyFilters(); });
merchantFavoritesFilter?.addEventListener('change', () => { resetFlatVisibleLimit(); applyFilters(); });
onlyFavoritesFilter?.addEventListener('change', () => { resetFlatVisibleLimit(); applyFilters(); });
merchantPlatformGroup?.addEventListener('change', () => { currentMerchantVisibleLimit = DEFAULT_MERCHANT_LIMIT; applyFilters(); });
platformFilterGroup?.addEventListener('change', () => { resetFlatVisibleLimit(); applyFilters(); });
document.addEventListener('click', event => {
  const button = event.target instanceof Element ? event.target.closest('[data-select-platform]') : null;
  if (!button) return;
  event.preventDefault(); event.stopImmediatePropagation();
  const group = button.dataset.platformScope === 'merchants' ? merchantPlatformGroup : platformFilterGroup;
  const input = [...group.querySelectorAll('input')].find(input => input.value === button.dataset.selectPlatform);
  if (input) { input.checked = true; resetFlatVisibleLimit(); applyFilters(); }
}, { capture: true });
document.querySelector('#searchOptions')?.addEventListener('filter-clear', () => {
  platformFilterGroup?.querySelectorAll('input').forEach(input => { input.checked = false; });
  for (const input of [priceMin, priceMax]) input.value = '';
  for (const input of [showSoldOutFilter, matchCategoryFilter, fuzzySearchFilter, onlyFavoritesFilter, onlyPlatformFilter]) input.checked = false;
  resetFlatVisibleLimit();
  applyFilters();
});
document.querySelector('#merchantOptions')?.addEventListener('filter-clear', () => {
  merchantPlatformGroup?.querySelectorAll('input').forEach(input => { input.checked = false; });
  for (const input of [merchantFavoritesFilter, merchantPlatformFilter]) input.checked = false;
  currentMerchantVisibleLimit = DEFAULT_MERCHANT_LIMIT;
  applyFilters();
});
showSoldOutFilter.addEventListener('change', () => {
  resetFlatVisibleLimit();
  trackUmamiEvent('filter-change', {
    scope: 'shops',
    name: 'showSoldOut',
    value: showSoldOutFilter.checked ? '1' : '0',
  }, showSoldOutFilter);
  applyFilters();
});
matchCategoryFilter.addEventListener('change', () => {
  resetFlatVisibleLimit();
  trackUmamiEvent('filter-change', {
    scope: 'shops',
    name: 'matchCategory',
    value: matchCategoryFilter.checked ? '1' : '0',
  }, matchCategoryFilter);
  applyFilters();
});
fuzzySearchFilter?.addEventListener('change', () => {
  resetFlatVisibleLimit();
  trackUmamiEvent('filter-change', {
    scope: 'shops',
    name: 'fuzzy',
    value: fuzzySearchFilter.checked ? '1' : '0',
  }, fuzzySearchFilter);
  scheduleApplyFilters();
});
priceMin.addEventListener('input', () => {
  resetFlatVisibleLimit();
  scheduleFilterTrack('priceMin');
  scheduleApplyFilters();
});
priceMax.addEventListener('input', () => {
  resetFlatVisibleLimit();
  scheduleFilterTrack('priceMax');
  scheduleApplyFilters();
});
function selectedQuickCategoryId() {
  const query = currentQuickPlanQuery;
  return [...quickPlanRow.querySelectorAll('[data-quick-plan-query]')]
    .find(button => button.dataset.quickPlanQuery === query)?.dataset.autoCategoryId || currentQuickPlanQuery.replace(/^autocat:\s*/, '');
}

function trackQuickPlanChange(button, action, previousCategoryId) {
  const productId = button.dataset.productId || button.closest('[data-product-options]')?.dataset.productOptions || '';
  const categoryId = button.dataset.autoCategoryId || '';
  trackUmamiEvent('filter-change', {
    scope: 'shops', reason: 'quick-plan', action,
    filterLevel: button.dataset.productId ? 'product' : categoryId === productId ? 'all-plans' : 'plan',
    productId, categoryId, previousCategoryId,
    selectedCategoryId: selectedQuickCategoryId(),
    name: button.dataset.quickPlanLabel || '',
  }, button);
}

function clearQuickPlanSelection() {
  currentQuickPlanQuery = '';
  currentQuickPlanPath = '';
  hideOfficialPriceTip();
  hideGatewayTip();
  resetFlatVisibleLimit();
  applyFilters();
}
quickPlanRow?.addEventListener('click', event => {
  if (event.target.closest('[data-clear-plan]')) { clearQuickPlanSelection(); return; }
  const previousCategoryId = selectedQuickCategoryId();
  const button = event.target.closest('[data-quick-plan-query]');
  if (!(button instanceof HTMLElement)) return;
  event.preventDefault();
  const sourceButton = button;
  if (button.getAttribute('aria-pressed') === 'true') return;
  const action = 'select';
  const query = button.dataset.quickPlanQuery || '';
  if (!query) return;
  currentQuickPlanQuery = query;
  currentQuickPlanPath = button.dataset.quickPlanPath || '';
  applySearchPageMeta(button.dataset.quickPlanDisplayName || button.textContent?.trim() || query, query, currentQuickPlanPath, button.dataset.quickPlanHeroName);
  resetFlatVisibleLimit();
  showOfficialPriceTip(button, query);
  showGatewayTip(button, query);
  reportSearchTerm(query, filteredFlatRows().length);
  applyFilters();
  trackQuickPlanChange(sourceButton, action, previousCategoryId);
});
flatProductRowsContainer?.addEventListener('click', event => {
  const button = event.target.closest('[data-filter-auto-category]');
  if (!button) return;
  const id = button.dataset.filterAutoCategory;
  const plan = Array.from(quickPlanRow.querySelectorAll('[data-auto-category-id]')).find(item => item.dataset.autoCategoryId === id);
  if (plan) plan.click();
  else { currentQuickPlanQuery = `autocat: ${id}`; currentQuickPlanPath = ''; hideOfficialPriceTip(); hideGatewayTip(); resetFlatVisibleLimit(); applyFilters(); }
});
flatProductLoadMoreButton?.addEventListener('click', () => {
  trackUmamiEvent('button-click', { scope: 'products', action: 'load-more' }, flatProductLoadMoreButton);
  currentFlatVisibleLimit += FLAT_PRODUCT_LOAD_MORE_STEP;
  applyFilters();
});
merchantLoadMoreButton?.addEventListener('click', () => {
  trackUmamiEvent('button-click', { scope: 'merchants', action: 'load-more' }, merchantLoadMoreButton);
  currentMerchantVisibleLimit += MERCHANT_LOAD_MORE_STEP;
  applyFilters();
});
flatSortButtons.forEach(button => {
  button.addEventListener('click', async () => {
    await loadShopProductsDataFromApi();
    resetFlatVisibleLimit();
    sortFlatProductRows(button);
    trackUmamiEvent('sort-change', {
      scope: 'products',
      key: button.dataset.sortKey || '',
      direction: button.dataset.sortDirection || 'none',
    }, button);
  });
});

merchantSortButtons.forEach(button => {
  button.addEventListener('click', () => {
    currentMerchantSort = nextSort(currentMerchantSort, button);
    currentMerchantVisibleLimit = DEFAULT_MERCHANT_LIMIT;
    applyFilters();
    trackUmamiEvent('sort-change', {
      scope: 'merchants',
      key: button.dataset.sortKey || '',
      direction: currentMerchantSort?.direction || 'none',
    }, button);
  });
});

document.querySelectorAll('.data-table-head-cell-sortable').forEach(headerCell => {
  headerCell.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('[data-inline-help]')) return;
    const button = headerCell.querySelector('.data-table-sort-button');
    if (!(button instanceof HTMLElement) || event.target === button || button.contains(event.target)) return;
    button.click();
  });
});

shopTabButtons.forEach(button => {
  button.addEventListener('click', () => {
    showShopTab(button.dataset.shopTab || 'products');
  });
});

document.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target.closest('[data-product-click-site-id]') : null;
  if (!(target instanceof HTMLElement)) return;
  const metricRow = target.closest('[data-product-metric-id]');
  if (metricRow instanceof HTMLElement) {
    void productMetricTracker.click(metricRow);
    return;
  }
  reportProductClick({
    productId: target.dataset.productClickId || '',
    siteId: target.dataset.productClickSiteId || '',
    productUrl: target.dataset.productClickUrl || '',
    categoryName: target.dataset.productClickCategory || '',
    name: target.dataset.productClickName || '',
  });
});
window.addEventListener('popstate', () => { syncFiltersFromUrl(); resetFlatVisibleLimit(); applyFilters(); });
loadFavorites();
buildFlatRows();
currentFlatRows = flatRows;
syncFiltersFromUrl();
applyFilters();

window.addEventListener('shop-favorites-changed', () => {
  loadFavorites();
  initializeFavorites();
  applyFilters();
});
