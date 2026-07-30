/*
 * 文件说明: 首页商品表格筛选、排序、收藏与商家分组懒渲染交互。
 */
import { buildShopSearchQuery, matchesShopSearchQuery, prepareShopSearchQuery } from '../shop-search-query.js';
import { buildShopSearchPageMeta } from '../shop-search-page-meta.js';

const filtersForm = document.querySelector('#filters');
const searchFilter = document.querySelector('#searchFilter');
const showSoldOutFilter = document.querySelector('#showSoldOutFilter');
const matchCategoryFilter = document.querySelector('#matchCategoryFilter');
const priceMin = document.querySelector('#priceMin');
const priceMax = document.querySelector('#priceMax');
const merchantFiltersForm = document.querySelector('#merchantFilters');
const merchantSearchFilter = document.querySelector('#merchantSearchFilter');
const quickTagFilters = document.querySelector('#quickTagFilters');
const quickPlanRow = document.querySelector('#quickPlanRow');
const officialPriceTip = document.querySelector('#officialPriceTip');
const gatewayTip = document.querySelector('#gatewayTip');
let shopProductsData = JSON.parse(document.querySelector('#shop-products-data')?.textContent || '{"sites":[],"products":[]}');
const shopsMessages = JSON.parse(document.querySelector('#shops-messages')?.textContent || '{}');
let flatProductRows = Array.from(document.querySelectorAll('.flat-product-row'));
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
const flatSortButtons = Array.from(document.querySelectorAll('.flat-sort-button[data-shop-sort-scope="products"]'));
const merchantSortButtons = Array.from(document.querySelectorAll('.flat-sort-button[data-shop-sort-scope="merchants"]'));
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
const DEFAULT_FLAT_SORT = { key: 'score', direction: 'desc', type: 'number' };
const FAVORITE_MERCHANT_PRODUCT_PIN_LIMIT = 10;
let currentFlatSort = { ...DEFAULT_FLAT_SORT };
let currentMerchantSort = null;
let currentFlatRows = flatRows;
let currentShopTab = 'products';
let favoriteSiteKeys = new Set();
let favoriteProductKeys = new Set();
let currentFlatVisibleLimit = Number(shopProductsData.initialProductLimit) > 0 ? Number(shopProductsData.initialProductLimit) : DEFAULT_FLAT_PRODUCT_LIMIT;
let currentMerchantVisibleLimit = DEFAULT_MERCHANT_LIMIT;
let isShopProductsDataLoading = false;
let shopProductsDataLoadPromise = null;
let quickSearchTags = quickTagFilters
  ? Array.from(quickTagFilters.querySelectorAll('button[data-tag-key]')).map(button => toQuickSearchTag(button.textContent || ''))
  : [];
let applyFiltersTimer = null;
let searchReportTimer = null;
let umamiFilterReportTimer = null;
const SEARCH_REPORT_DELAY_MS = 5000;
const SEARCH_REPORT_DEDUP_WINDOW_MS = 2 * 60 * 1000;
let lastReportedQuery = '';
let lastReportedUmamiFilterKey = '';
const recentSearchReports = new Map();
let currentQuickPlanPath = shopsMessages.seoSearchPath || '';
let currentSearchPageMetaQuery = shopsMessages.seoSearchQuery || '';
let currentSearchPageMetaPath = shopsMessages.seoSearchPath || '';

function trackUmamiEvent(eventName, eventData = {}) {
  if (typeof window.umami?.track !== 'function') return;
  window.umami.track(eventName, eventData);
}

function showShopTab(tabName, options = {}) {
  const nextTab = tabName === 'merchants' ? 'merchants' : 'products';
  currentShopTab = nextTab;
  shopTabButtons.forEach(button => {
    const active = button.dataset.shopTab === nextTab;
    button.classList.toggle('tab-active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  shopTabPanels.forEach(panel => {
    panel.hidden = panel.dataset.shopPanel !== nextTab;
  });
  if (options.shouldApply !== false) {
    resetFlatVisibleLimit();
    applyFilters();
  }
  if (options.track !== false) {
    trackUmamiEvent('shop-tab-click', { name: nextTab });
  }
}

function toQuickSearchTag(label) {
  return {
    key: normalize(label).replace(/\s+/g, '-'),
    label,
  };
}

function normalize(value) {
  return (value || '').trim().toLowerCase();
}

function currentSearchFieldOptions() {
  return {
    matchCategory: Boolean(matchCategoryFilter?.checked),
    matchMerchant: false,
  };
}

function buildActiveSearchQuery(value) {
  return buildShopSearchQuery(value);
}

function matchesSearchQuery(rowEntry, query) {
  return matchesShopSearchQuery(rowEntry, query, currentSearchFieldOptions());
}

function searchMatchedFlatRows() {
  const query = buildActiveSearchQuery(searchFilter?.value || '');
  const matchedRows = flatRows.filter(rowEntry => {
    const showSoldOut = Boolean(showSoldOutFilter?.checked);
    const priceMinValue = priceMin?.value.trim() || '';
    const priceMaxValue = priceMax?.value.trim() || '';
    const minPrice = parseBound(priceMinValue);
    const maxPrice = parseBound(priceMaxValue);
    const stockMatched = showSoldOut || rowEntry.inStock === 1;
    const priceMatched = matchesPriceRange(rowEntry.priceValue, minPrice, maxPrice);
    const queryMatched = matchesSearchQuery(rowEntry, query);
    return stockMatched && priceMatched && queryMatched;
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

function saveFavoriteKeys(storageKey, keys) {
  localStorage.setItem(storageKey, JSON.stringify([...keys]));
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

function renderFavoriteButtonsByKey(favoriteKind, key, isFavorite) {
  favoriteButtons
    .filter(button => button.dataset.favoriteKind === favoriteKind && button.dataset.favoriteKey === key)
    .forEach(button => renderFavoriteButton(button, isFavorite, favoriteKind));

  if (favoriteKind === 'site' && merchantViewModule) {
    merchantViewModule.getMerchantRowElements()
      .filter(row => row.dataset.siteId === key)
      .forEach(row => {
        row.dataset.favorite = isFavorite ? '1' : '0';
      });
  }
}

function initializeFavoriteButton(button) {
  if (button.dataset.favoriteInitialized === '1') return;
  button.dataset.favoriteInitialized = '1';
  const key = button.dataset.favoriteKey;
  const favoriteKind = button.dataset.favoriteKind || 'site';
  const favoriteKeys = favoriteKind === 'product' ? favoriteProductKeys : favoriteSiteKeys;
  renderFavoriteButton(button, favoriteKeys.has(key), favoriteKind);
  button.addEventListener('click', () => {
    if (!key) return;
    const nextFavorite = !favoriteKeys.has(key);
    if (favoriteKeys.has(key)) {
      favoriteKeys.delete(key);
    } else {
      favoriteKeys.add(key);
    }
    trackUmamiEvent('favorite-click', {
      kind: favoriteKind,
      key,
      action: nextFavorite ? 'add' : 'remove',
    });
    saveFavoriteKeys(favoriteKind === 'product' ? favoriteProductStorageKey : favoriteSiteStorageKey, favoriteKeys);
    renderFavoriteButtonsByKey(favoriteKind, key, favoriteKeys.has(key));
    applyFilters();
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
  const favoriteProductRows = [];
  const favoriteMerchantRowsBySite = new Map();
  rowEntries.forEach(rowEntry => {
    if (favoriteProductKeys.has(rowEntry.productFavoriteKey)) {
      favoriteProductRows.push(rowEntry);
    } else if (favoriteSiteKeys.has(rowEntry.siteFavoriteKey)) {
      const rows = favoriteMerchantRowsBySite.get(rowEntry.siteFavoriteKey) || [];
      rows.push(rowEntry);
      favoriteMerchantRowsBySite.set(rowEntry.siteFavoriteKey, rows);
    }
  });

  const favoriteMerchantRows = [];
  const pinnedRows = new Set(favoriteProductRows);
  while (favoriteMerchantRows.length < FAVORITE_MERCHANT_PRODUCT_PIN_LIMIT && favoriteMerchantRowsBySite.size > 0) {
    for (const [siteKey, rows] of favoriteMerchantRowsBySite) {
      const row = rows.shift();
      if (row) {
        favoriteMerchantRows.push(row);
        pinnedRows.add(row);
      }
      if (rows.length === 0) favoriteMerchantRowsBySite.delete(siteKey);
      if (favoriteMerchantRows.length >= FAVORITE_MERCHANT_PRODUCT_PIN_LIMIT) break;
    }
  }

  const regularRows = rowEntries.filter(rowEntry => !pinnedRows.has(rowEntry));
  return [...favoriteProductRows, ...favoriteMerchantRows, ...regularRows];
}

function parseStructuredPriceToCny(priceNumber, priceUnit) {
  if (typeof priceNumber !== 'number' || !Number.isFinite(priceNumber)) return null;
  const normalizedUnit = normalize(priceUnit);
  if (!normalizedUnit) return null;
  if (normalizedUnit === '¥' || normalizedUnit === '￥' || normalizedUnit === '元') return priceNumber;
  if (normalizedUnit === '$' || normalizedUnit === 'usd') return priceNumber * 7;
  return null;
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
  const stock = Number(product.stock);
  return Number.isFinite(stock) && stock > 0 ? stock : null;
}

function productStockLabel(product, options = {}) {
  const stock = productStockNumber(product);
  if (stock !== null) return options.prefix ? `${options.prefix}${stock}` : String(stock);
  return product.inStock ? (shopsMessages.inStock || 'In stock') : (shopsMessages.soldOut || 'Out of stock');
}

function productStockValue(product) {
  return productStockNumber(product) ?? (product.inStock ? 1 : 0);
}

function formatScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return '-';
  return Number.isInteger(score) ? String(score) : score.toFixed(2);
}

function buildFlatRows() {
  flatRows.length = 0;
  const products = Array.isArray(shopProductsData.products) ? shopProductsData.products : [];

  flatProductRows.forEach((row, index) => {
    const product = products[index] || {};
    const siteId = text(product.siteId);
    const siteName = text(product.siteName);
    const siteUrl = text(product.siteUrl).trim();
    const categoryName = text(product.categoryName);
    const productName = text(product.name);
    const productTitle = `${categoryName}-${productName}`;
    const priceText = formatDisplayPrice(product.priceNumber, product.priceUnit);
    flatRows.push({
      siteId,
      siteFavoriteKey: siteId || siteName,
      siteName: siteName.toLowerCase(),
      siteText: siteName.toLowerCase(),
      siteUrl: siteUrl.toLowerCase(),
      categoryName: categoryName.toLowerCase(),
      productName: productName.toLowerCase(),
      productTitle: `${categoryName} ${productName} ${productTitle}`.toLowerCase(),
      productFavoriteKey: `${siteName}#${productTitle}`,
      priceText,
      priceNumber: typeof product.priceNumber === 'number' ? product.priceNumber : null,
      priceUnit: typeof product.priceUnit === 'string' ? product.priceUnit : null,
      priceValue: priceValueForSort(product.priceNumber, product.priceUnit),
      stockValue: productStockValue(product),
      inStock: product.inStock ? 1 : 0,
      score: Number(product.score) || 0,
      siteScore: Number(product.siteScore) || 0,
      productRefreshedAt: new Date(product.refreshedAt || '').getTime() || 0,
      element: row,
      indexCell: row.querySelector('.flat-row-index'),
      originalIndex: index,
    });
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
  if (params.has('q')) {
    searchFilter.value = params.get('q') || '';
  }
  if (showSoldOutFilter) showSoldOutFilter.checked = params.get('showSoldOut') === '1';
  if (params.has('priceMin')) {
    priceMin.value = params.get('priceMin') || '';
  }
  if (params.has('priceMax')) {
    priceMax.value = params.get('priceMax') || '';
  }
  if (matchCategoryFilter) matchCategoryFilter.checked = params.get('matchCategory') === '1';
  showShopTab('products', { shouldApply: false, track: false });
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
    query: searchFilter?.value.trim() || '',
    merchantQuery: merchantSearchFilter?.value.trim() || '',
    priceMin: priceMin?.value.trim() || '',
    priceMax: priceMax?.value.trim() || '',
    showSoldOut: showSoldOutFilter?.checked ? '1' : '0',
    tab: currentShopTab,
    matchCategory: matchCategoryFilter?.checked ? '1' : '0',
  };
}

function scheduleFilterTrack(reason) {
  clearTimeout(umamiFilterReportTimer);
  umamiFilterReportTimer = setTimeout(() => {
    const eventData = currentFilterEventData(reason);
    const eventKey = JSON.stringify(eventData);
    if (eventKey === lastReportedUmamiFilterKey) return;
    lastReportedUmamiFilterKey = eventKey;
    trackUmamiEvent('filter-change', eventData);
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

function shouldResetSearchPageMeta(searchQuery) {
  return Boolean(
    currentSearchPageMetaQuery
      && (!currentQuickPlanPath || currentQuickPlanPath !== currentSearchPageMetaPath || searchQuery !== currentSearchPageMetaQuery),
  );
}

function resetSearchPageMeta(searchQuery) {
  if (!shouldResetSearchPageMeta(searchQuery)) return;
  if (shopsMessages.defaultPageTitle) document.title = shopsMessages.defaultPageTitle;
  if (shopPageHeroTitle && shopsMessages.defaultHeroTitle) shopPageHeroTitle.textContent = shopsMessages.defaultHeroTitle;
  if (shopPageHeroDescription && shopsMessages.defaultHeroDescription) shopPageHeroDescription.textContent = shopsMessages.defaultHeroDescription;
  currentSearchPageMetaQuery = '';
  currentSearchPageMetaPath = '';
}

function applySearchPageMeta(termLabel, searchQuery, searchPath) {
  const meta = buildShopSearchPageMeta(termLabel, {
    searchResultsTitle: shopsMessages.searchResultsTitle || '{term}',
    searchResultsDescription: shopsMessages.searchResultsDescription || '',
    titleSuffix: shopsMessages.titleSuffix || '',
  });
  document.title = meta.documentTitle;
  if (shopPageHeroTitle) shopPageHeroTitle.textContent = meta.heroTitle;
  if (shopPageHeroDescription) shopPageHeroDescription.textContent = meta.heroDescription;
  currentSearchPageMetaQuery = searchQuery;
  currentSearchPageMetaPath = searchPath;
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
}

function showOfficialPriceTip(button, query) {
  if (!officialPriceTip) return;
  const officialPricePath = button.dataset.officialPricePath || '';
  const label = button.textContent?.trim() || query;
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
}

function showGatewayTip(button, query) {
  if (!gatewayTip) return;
  const gatewayPath = button.dataset.gatewayPath || '';
  const label = (button.dataset.gatewayModelFamilyName || button.textContent || query).trim();
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
}

function shopProductsDataIsPartial() {
  return Boolean(shopProductsData.isPartial);
}

function loadedProductCount() {
  return Array.isArray(shopProductsData.products) ? shopProductsData.products.length : 0;
}

function totalProductCount() {
  return Number(shopProductsData.totalProductCount) || loadedProductCount();
}

function shouldLoadFullShopProductsData(options = {}) {
  if (!shopProductsDataIsPartial()) return false;
  return Boolean(
    options.force
    || options.merchantTab
    || options.searchQuery
    || options.showSoldOut
    || options.matchCategory
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

function createTrackedProductLink(href, className, label, eventLabel) {
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.dataset.umamiEvent = 'product-click';
  link.dataset.umamiEventUrl = href;
  link.dataset.umamiEventName = eventLabel;
  link.className = className;
  link.textContent = label;
  return link;
}

function createTrackedMerchantLink(href, label) {
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.dataset.umamiEvent = 'merchant-click';
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
  const siteId = text(item.siteId);
  const siteName = text(item.siteName);
  const siteUrl = text(item.siteUrl).trim();
  const categoryName = text(item.categoryName);
  const productName = text(item.name);
  const productTitle = `${categoryName}-${productName}`;
  const productFavoriteKey = `${siteName}#${productTitle}`;
  const siteFavoriteKey = siteId || siteName;
  const row = document.createElement('tr');
  row.className = 'flat-product-row';

  const indexCell = appendTextElement(row, 'th', 'flat-row-index', '');
  indexCell.scope = 'row';
  indexCell.setAttribute('data-label', tableLabel('sequence'));

  const productCell = document.createElement('td');
  productCell.className = 'flat-product-cell';
  productCell.setAttribute('data-label', tableLabel('product'));
  const productInline = document.createElement('div');
  productInline.className = 'cell-inline';
  productInline.appendChild(createFavoriteButton('product', productFavoriteKey, `${shopsMessages.productFavorite || 'Favorite product'} ${productTitle}`));
  if (item.productUrl) {
    const productLink = createTrackedProductLink(item.productUrl, 'product-link', productName, productTitle);
    productLink.dataset.productClickSiteId = siteId;
    productLink.dataset.productClickUrl = item.productUrl;
    productLink.dataset.productClickCategory = categoryName;
    productLink.dataset.productClickName = productName;
    productInline.appendChild(productLink);
  } else {
    appendTextElement(productInline, 'span', 'product-text', productName);
  }
  productCell.appendChild(productInline);
  row.appendChild(productCell);

  const priceCell = document.createElement('td');
  priceCell.className = 'flat-price-cell';
  priceCell.setAttribute('data-label', tableLabel('price'));
  priceCell.appendChild(document.createTextNode(formatDisplayPrice(item.priceNumber, item.priceUnit)));
  row.appendChild(priceCell);

  const statusCell = document.createElement('td');
  statusCell.className = 'flat-status-cell';
  statusCell.setAttribute('data-label', tableLabel('stock'));
  appendTextElement(
    statusCell,
    'span',
    item.inStock ? 'stock-badge-in-stock' : 'stock-badge-sold-out',
    productStockLabel(item),
  );
  row.appendChild(statusCell);

  const categoryCell = document.createElement('td');
  categoryCell.className = 'flat-category-cell';
  categoryCell.setAttribute('data-label', tableLabel('category'));
  categoryCell.appendChild(document.createTextNode(categoryName));
  row.appendChild(categoryCell);

  const productScoreCell = document.createElement('td');
  productScoreCell.className = 'flat-product-score-cell';
  productScoreCell.setAttribute('data-label', tableLabel('productScore'));
  productScoreCell.appendChild(document.createTextNode(formatScore(item.score)));
  row.appendChild(productScoreCell);

  const merchantCell = document.createElement('td');
  merchantCell.className = 'flat-merchant-cell';
  merchantCell.setAttribute('data-label', tableLabel('merchant'));
  const merchantInline = document.createElement('div');
  merchantInline.className = 'cell-inline';
  merchantInline.appendChild(createFavoriteButton('site', siteFavoriteKey, `${shopsMessages.merchantFavorite || 'Favorite merchant'} ${siteName}`));
  if (siteUrl) {
    merchantInline.appendChild(createTrackedMerchantLink(siteUrl, siteName));
  } else {
    appendTextElement(merchantInline, 'span', 'merchant-text', siteName);
  }
  merchantCell.appendChild(merchantInline);
  row.appendChild(merchantCell);

  const refreshCell = document.createElement('td');
  refreshCell.className = 'flat-refresh-cell';
  refreshCell.setAttribute('data-label', tableLabel('latestRefresh'));
  refreshCell.appendChild(document.createTextNode(text(item.refreshTime)));
  row.appendChild(refreshCell);

  return row;
}

function renderFlatProductRowsFromData() {
  if (!flatProductRowsContainer) return;
  const products = Array.isArray(shopProductsData.products) ? shopProductsData.products : [];
  const fragment = document.createDocumentFragment();
  products.forEach(item => {
    fragment.appendChild(createFlatProductRow(item));
  });
  flatProductRowsContainer.replaceChildren(fragment);
  flatProductRows = Array.from(document.querySelectorAll('.flat-product-row'));
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

  if (visibleCount === 0) {
    flatProductProgressiveLoad.classList.add('hidden');
    flatProductLoadSummary.classList.add('hidden');
    flatProductLoadMoreButton.classList.add('hidden');
    return;
  }

  flatProductProgressiveLoad.classList.remove('hidden');
  flatProductLoadSummary.classList.remove('hidden');

  const totalVisibleCount = shopProductsDataIsPartial() && visibleCount === loadedProductCount() && renderedCount === visibleCount
    ? totalProductCount()
    : visibleCount;
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
    .replace('{total}', String(visibleCount));
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

function renderMerchantViewModule(module) {
  module.renderMerchantRows({
    shopProductsData,
    shopsMessages,
    createFavoriteButton,
    createTrackedLink: (href, className, label, eventLabel) => {
      if (className.includes('merchant')) return createTrackedMerchantLink(href, label);
      return createTrackedProductLink(href, className, label, eventLabel);
    },
    initializeFavorites,
    getFavoriteButtons: () => favoriteButtons,
    setFavoriteButtons: nextButtons => {
      favoriteButtons = nextButtons;
    },
  });
}

async function applyFilters(options = {}) {
  const merchantTabActive = currentShopTab === 'merchants';
  const productQueryValue = searchFilter?.value.trim() || '';
  const merchantQueryValue = merchantSearchFilter?.value.trim() || '';
  const query = buildActiveSearchQuery(productQueryValue);
  const showSoldOut = Boolean(showSoldOutFilter?.checked);
  const priceMinValue = priceMin?.value.trim() || '';
  const priceMaxValue = priceMax?.value.trim() || '';
  const minPrice = parseBound(priceMinValue);
  const maxPrice = parseBound(priceMaxValue);
  const normalizedMerchantQuery = normalize(merchantQueryValue);
  let visibleFlatProductCount = 0;
  let visibleMerchantCount = 0;
  let renderedMerchantCount = 0;
  let visibleProductCount = 0;

  if (shouldLoadFullShopProductsData({
    merchantTab: merchantTabActive,
    searchQuery: merchantTabActive ? '' : productQueryValue,
    showSoldOut: merchantTabActive ? false : showSoldOut,
    matchCategory: !merchantTabActive && Boolean(matchCategoryFilter?.checked),
    priceMinValue,
    priceMaxValue,
  })) {
    const wasPartial = shopProductsDataIsPartial();
    await loadShopProductsDataFromApi();
    if (wasPartial && !shopProductsDataIsPartial()) {
      return;
    }
  }

  merchantGroupedView.hidden = !merchantTabActive;
  flatProductView.hidden = merchantTabActive;

  if (merchantTabActive) {
    const merchantModule = await loadMerchantViewModule();
    if (!merchantModule.isMerchantViewRendered()) {
      renderMerchantViewModule(merchantModule);
    }
    merchantModule.getMerchantRows().forEach(({ element: row, chips }) => {
      chips.forEach(chip => {
        chip.classList.remove('hidden');
      });

      const visibleRowProductCount = Number(row.dataset.productCount) || 0;
      const hasProducts = Number(row.dataset.productCount) > 0;
      const merchantMatched = !normalizedMerchantQuery
        || normalize(`${row.dataset.siteName || ''} ${row.dataset.siteText || ''} ${row.dataset.siteUrl || ''}`).includes(normalizedMerchantQuery);
      const rowVisible = merchantMatched && (visibleRowProductCount > 0 || !hasProducts);
      row.dataset.visibleProductMatchCount = '0';
      row.dataset.visibleInStockCount = '0';
      row.dataset.visibleSoldOutCount = '0';
      row.dataset.visibleProductCount = String(visibleRowProductCount);
      row.dataset.filterVisible = rowVisible ? '1' : '0';
      if (rowVisible) visibleProductCount += visibleRowProductCount;
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
    visibleProductCount = visibleFlatProductCount;
    const renderedFlatCount = Math.min(currentFlatVisibleLimit, currentFlatRows.length);
    currentFlatRows.forEach(({ element: row }, index) => {
      row.classList.toggle('hidden', index >= renderedFlatCount);
    });
    updateFlatProductIndexes();
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
  const shouldUseCanonicalShopPath = shouldResetSearchPageMeta(productQueryValue);
  const params = new URLSearchParams();
  if (!merchantTabActive) {
    if (productQueryValue && (!currentQuickPlanPath || shouldUseCanonicalShopPath)) params.set('q', productQueryValue);
    if (showSoldOut) params.set('showSoldOut', '1');
    if (matchCategoryFilter?.checked) params.set('matchCategory', '1');
    if (priceMinValue) params.set('priceMin', priceMinValue);
    if (priceMaxValue) params.set('priceMax', priceMaxValue);
  }
  resetSearchPageMeta(productQueryValue);
  const nextPath = currentQuickPlanPath && !shouldUseCanonicalShopPath ? currentQuickPlanPath : '/shops';
  const nextUrl = params.toString() ? `${nextPath}?${params.toString()}` : nextPath;
  history.replaceState(null, '', nextUrl);
}

function sortRows(merchantModule) {
  if (!rowContainer) return { visibleCount: 0, renderedCount: 0 };
  let visibleCount = 0;
  let renderedCount = 0;

  merchantModule.getMerchantRows()
    .slice()
    .sort((a, b) => {
      const favoriteDiff = Number(b.element.dataset.favorite) - Number(a.element.dataset.favorite);
      if (favoriteDiff !== 0) return favoriteDiff;

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

      const siteScoreDiff = Number(b.element.dataset.siteScore) - Number(a.element.dataset.siteScore);
      if (siteScoreDiff !== 0) return siteScoreDiff;

      return Number(a.element.dataset.originalIndex) - Number(b.element.dataset.originalIndex);
    })
    .forEach(({ element: row, indexCell }, sortedIndex) => {
      row.dataset.sortedIndex = String(sortedIndex);
      rowContainer.appendChild(row);
      const rowVisible = row.dataset.filterVisible === '1';
      if (rowVisible) visibleCount += 1;
      const rowRendered = rowVisible && visibleCount <= currentMerchantVisibleLimit;
      row.classList.toggle('hidden', !rowRendered);
      if (rowRendered) {
        renderedCount += 1;
        if (indexCell) indexCell.textContent = String(visibleCount);
      } else if (indexCell) {
        indexCell.textContent = '';
      }
    });

  updateMerchantSortButtons();
  return { visibleCount, renderedCount };
}

function merchantRowValue(row, key, type) {
  let value = row.dataset[key] ?? '';
  if (key === 'rank') value = Number(row.dataset.originalIndex) + 1;
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
  const value = rowEntry[key] ?? '';
  if (type === 'number') return Number(value) || 0;
  return value;
}

function updateFlatProductIndexes() {
  let visibleFlatIndex = 0;
  currentFlatRows.forEach(({ element: row, indexCell }) => {
    if (!row.classList.contains('hidden')) {
      visibleFlatIndex += 1;
      if (indexCell) indexCell.textContent = String(visibleFlatIndex);
    } else if (indexCell) {
      indexCell.textContent = '';
    }
  });
}

function appendCurrentFlatRows() {
  if (!flatProductRowsContainer) return;
  const fragment = document.createDocumentFragment();
  currentFlatRows.forEach(({ element: row }) => {
    fragment.appendChild(row);
  });
  flatProductRowsContainer.replaceChildren(fragment);
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
  currentFlatRows.forEach(({ element: row }, index) => {
    row.classList.toggle('hidden', index >= renderedFlatCount);
  });
  updateFlatProductIndexes();
  updateFlatProgressiveLoadSummary(currentFlatRows.length, renderedFlatCount);
  updateFlatSortButtons();
}

function updateFlatSortButtons() {
  flatSortButtons.forEach(button => {
    const active = currentFlatSort?.key === button.dataset.sortKey;
    const headerCell = button.closest('th');
    const indicator = headerCell?.querySelector('.sort-indicator') || button.querySelector('.sort-indicator');
    const status = button.querySelector('.sort-status');
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
    const headerCell = button.closest('.flat-sort-head');
    const indicator = headerCell?.querySelector('.sort-indicator') || button.querySelector('.sort-indicator');
    const status = button.querySelector('.sort-status');
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
  if (!nextShopProductsData || !Array.isArray(nextShopProductsData.products) || !Array.isArray(nextShopProductsData.sites)) return;

  shopProductsData = {
    ...nextShopProductsData,
    isPartial: false,
  };
  isShopProductsDataLoading = false;
  currentFlatVisibleLimit = DEFAULT_FLAT_PRODUCT_LIMIT;
  currentMerchantVisibleLimit = DEFAULT_MERCHANT_LIMIT;
  if (merchantViewModule) {
    merchantViewModule.resetMerchantViewState();
  }
  renderFlatProductRowsFromData();
  currentFlatRows = flatRows;
  buildFlatRows();
  favoriteButtons = Array.from(document.querySelectorAll('.favorite-toggle'));
  initializeFavorites();
  if (currentFlatSort) sortFlatProductRows();
  applyFilters();
}

async function loadShopProductsDataFromApi() {
  if (!shopProductsDataIsPartial()) return;
  if (shopProductsDataLoadPromise) return shopProductsDataLoadPromise;

  shopProductsDataLoadPromise = (async () => {
    isShopProductsDataLoading = true;
    updateFlatProgressiveLoadSummary(0, 0);
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
  currentQuickPlanPath = '';
  hideOfficialPriceTip();
  hideGatewayTip();
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
showSoldOutFilter.addEventListener('change', () => {
  resetFlatVisibleLimit();
  trackUmamiEvent('filter-toggle-click', {
    name: 'showSoldOut',
    value: showSoldOutFilter.checked ? '1' : '0',
  });
  applyFilters();
});
matchCategoryFilter.addEventListener('change', () => {
  resetFlatVisibleLimit();
  trackUmamiEvent('filter-toggle-click', {
    name: 'matchCategory',
    value: matchCategoryFilter.checked ? '1' : '0',
  });
  applyFilters();
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
quickTagFilters?.addEventListener('click', event => {
  const button = event.target.closest('button[data-tag-key]');
  if (!button) return;
  const tagKey = button.dataset.tagKey;
  const tag = quickSearchTags.find(item => item.key === tagKey);
  if (!tag) return;
  searchFilter.value = tag.label;
  resetFlatVisibleLimit();
  currentQuickPlanPath = '';
  hideOfficialPriceTip();
  hideGatewayTip();
  reportSearchTerm(tag.label, filteredFlatRows().length);
  applyFilters();
});
quickPlanRow?.addEventListener('click', event => {
  const button = event.target.closest('[data-quick-plan-query]');
  if (!(button instanceof HTMLElement)) return;
  event.preventDefault();
  const query = button.dataset.quickPlanQuery || '';
  if (!query) return;
  searchFilter.value = query;
  currentQuickPlanPath = button.dataset.quickPlanPath || '';
  applySearchPageMeta(button.textContent?.trim() || query, query, currentQuickPlanPath);
  resetFlatVisibleLimit();
  showOfficialPriceTip(button, query);
  showGatewayTip(button, query);
  reportSearchTerm(query, filteredFlatRows().length);
  applyFilters();
  trackUmamiEvent('quick-plan-search-click', {
    name: button.textContent?.trim() || query,
    query,
  });
});
flatProductLoadMoreButton?.addEventListener('click', () => {
  currentFlatVisibleLimit += FLAT_PRODUCT_LOAD_MORE_STEP;
  applyFilters();
});
merchantLoadMoreButton?.addEventListener('click', () => {
  currentMerchantVisibleLimit += MERCHANT_LOAD_MORE_STEP;
  applyFilters();
});
flatSortButtons.forEach(button => {
  button.addEventListener('click', () => {
    sortFlatProductRows(button);
    trackUmamiEvent('product-sort-click', {
      key: button.dataset.sortKey || '',
      direction: button.dataset.sortDirection || '',
    });
  });
});

merchantSortButtons.forEach(button => {
  button.addEventListener('click', () => {
    currentMerchantSort = nextSort(currentMerchantSort, button);
    currentMerchantVisibleLimit = DEFAULT_MERCHANT_LIMIT;
    applyFilters();
    trackUmamiEvent('merchant-sort-click', {
      key: button.dataset.sortKey || '',
      direction: currentMerchantSort?.direction || 'none',
    });
  });
});

document.querySelectorAll('.flat-sort-head').forEach(headerCell => {
  headerCell.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('[data-inline-help]')) return;
    const button = headerCell.querySelector('.flat-sort-button');
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
  reportProductClick({
    siteId: target.dataset.productClickSiteId || '',
    productUrl: target.dataset.productClickUrl || '',
    categoryName: target.dataset.productClickCategory || '',
    name: target.dataset.productClickName || '',
  });
});
renderFlatProductRowsFromData();
buildFlatRows();
loadFavorites();
initializeFavorites();
syncFiltersFromUrl();
applyFilters();
