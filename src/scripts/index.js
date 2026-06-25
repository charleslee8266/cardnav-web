/*
 * 文件说明: 首页商品表格筛选、排序、收藏与商家分组懒渲染交互。
 */
const filtersForm = document.querySelector('#filters');
const searchFilter = document.querySelector('#searchFilter');
const showSoldOutFilter = document.querySelector('#showSoldOutFilter');
const groupByMerchantFilter = document.querySelector('#groupByMerchantFilter');
const matchCategoryFilter = document.querySelector('#matchCategoryFilter');
const matchMerchantFilter = document.querySelector('#matchMerchantFilter');
const priceMin = document.querySelector('#priceMin');
const priceMax = document.querySelector('#priceMax');
const flatSortSelect = document.querySelector('#flatSortSelect');
const quickTagFilters = document.querySelector('#quickTagFilters');
const quickPlanRow = document.querySelector('#quickPlanRow');
const quickPlanToggle = document.querySelector('#quickPlanToggle');
const advancedSearchHelp = document.querySelector('#advancedSearchHelp');
let shopProductsData = JSON.parse(document.querySelector('#shop-products-data')?.textContent || '{"sites":[],"products":[]}');
const shopsMessages = JSON.parse(document.querySelector('#shops-messages')?.textContent || '{}');
let flatProductRows = Array.from(document.querySelectorAll('.flat-product-row'));
const emptyState = document.querySelector('#emptyState');
const rowContainer = document.querySelector('#merchantRows');
const flatProductRowsContainer = document.querySelector('#flatProductRows');
const flatProductProgressiveLoad = document.querySelector('#flatProductProgressiveLoad');
const flatProductLoadSummary = document.querySelector('#flatProductLoadSummary');
const flatProductLoadMoreButton = document.querySelector('#flatProductLoadMoreButton');
const merchantGroupedView = document.querySelector('#merchantGroupedView');
const flatProductView = document.querySelector('#flatProductView');
const shopPageHeroTitle = document.querySelector('#shopPageHeroTitle');
const shopPageHeroDescription = document.querySelector('#shopPageHeroDescription');
const flatSortButtons = Array.from(document.querySelectorAll('.flat-sort-button'));
let favoriteButtons = Array.from(document.querySelectorAll('.favorite-toggle'));
const flatRows = [];
let merchantViewModule = null;
let merchantViewModulePromise = null;
const favoriteSiteStorageKey = 'cardnav.favoriteSites';
const favoriteProductStorageKey = 'cardnav.favoriteProducts';
const DEFAULT_FLAT_PRODUCT_LIMIT = 100;
const FLAT_PRODUCT_LOAD_MORE_STEP = 100;
const FLAT_SORT_PRESETS = {
  default: null,
  'price-asc': { key: 'priceValue', direction: 'asc', type: 'number' },
  'stock-desc': { key: 'stockValue', direction: 'desc', type: 'number' },
  'refresh-desc': { key: 'productRefreshedAt', direction: 'desc', type: 'number' },
};
let currentFlatSort = null;
let currentFlatRows = flatRows;
let favoriteSiteKeys = new Set();
let favoriteProductKeys = new Set();
let currentFlatVisibleLimit = Number(shopProductsData.initialProductLimit) > 0 ? Number(shopProductsData.initialProductLimit) : DEFAULT_FLAT_PRODUCT_LIMIT;
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
const QUICK_PLAN_VISIBLE_LIMIT = 12;
let lastReportedQuery = '';
let lastReportedUmamiFilterKey = '';
const recentSearchReports = new Map();
let quickPlanExpanded = false;
let hasResetSeoSearchPageTitle = false;

function trackUmamiEvent(eventName, eventData = {}) {
  if (typeof window.umami?.track !== 'function') return;
  window.umami.track(eventName, eventData);
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

function searchTerms(value) {
  return normalize(value).replace(/\s*\|\s*/g, '|').split(/\s+/).filter(Boolean);
}

function searchTermGroup(value) {
  return value.split('|').map(term => term.trim()).filter(Boolean);
}

function parseSearchQuery(value) {
  return searchTerms(value).reduce((query, term) => {
    if (term.startsWith('-')) {
      const excludedGroup = searchTermGroup(term.slice(1));
      if (excludedGroup.length > 0) query.excludeGroups.push(excludedGroup);
    } else {
      const includedGroup = searchTermGroup(term);
      if (includedGroup.length > 0) query.includeGroups.push(includedGroup);
    }
    return query;
  }, { includeGroups: [], excludeGroups: [] });
}

function matchTermCount(value, terms) {
  return terms.reduce((count, term) => count + (value.includes(term) ? 1 : 0), 0);
}

function matchesAnyTermAcrossEnabledFields(rowEntry, terms) {
  const matchCategory = matchCategoryFilter.checked;
  const matchMerchant = matchMerchantFilter.checked;
  return terms.some(term => {
    if (rowEntry.productName.includes(term)) return true;
    if (matchCategory && rowEntry.categoryName.includes(term)) return true;
    if (matchMerchant && rowEntry.siteText.includes(term)) return true;
    return false;
  });
}

function matchesEverySearchGroupAcrossEnabledFields(rowEntry, groups) {
  return groups.every(group => matchesAnyTermAcrossEnabledFields(rowEntry, group));
}

function matchesAnySearchGroupAcrossEnabledFields(rowEntry, groups) {
  return groups.some(group => matchesAnyTermAcrossEnabledFields(rowEntry, group));
}

function searchMatchedFlatRows() {
  const { includeGroups, excludeGroups } = parseSearchQuery(searchFilter.value);
  const matchedRows = flatRows.filter(rowEntry => {
    const showSoldOut = showSoldOutFilter.checked;
    const priceMinValue = priceMin.value.trim();
    const priceMaxValue = priceMax.value.trim();
    const minPrice = parseBound(priceMinValue);
    const maxPrice = parseBound(priceMaxValue);
    const stockMatched = showSoldOut || rowEntry.inStock === 1;
    const priceMatched = matchesPriceRange(rowEntry.priceValue, minPrice, maxPrice);
    const includeMatched = includeGroups.length === 0 || matchesEverySearchGroupAcrossEnabledFields(rowEntry, includeGroups);
    const excludeMatched = excludeGroups.length > 0 && matchesAnySearchGroupAcrossEnabledFields(rowEntry, excludeGroups);
    const queryMatched = includeMatched && !excludeMatched;
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

function isFlatRowFavorite(rowEntry) {
  return favoriteProductKeys.has(rowEntry.productFavoriteKey) || favoriteSiteKeys.has(rowEntry.siteFavoriteKey);
}

function prioritizeFavoriteFlatRows(rowEntries) {
  const favoriteRows = [];
  const regularRows = [];
  rowEntries.forEach(rowEntry => {
    if (isFlatRowFavorite(rowEntry)) {
      favoriteRows.push(rowEntry);
    } else {
      regularRows.push(rowEntry);
    }
  });
  return [...favoriteRows, ...regularRows];
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

function buildFlatRows() {
  flatRows.length = 0;
  const products = Array.isArray(shopProductsData.products) ? shopProductsData.products : [];

  flatProductRows.forEach((row, index) => {
    const product = products[index] || {};
    const siteId = text(product.siteId);
    const siteName = text(product.siteName);
    const categoryName = text(product.categoryName);
    const productName = text(product.name);
    const productTitle = `${categoryName}-${productName}`;
    const priceText = formatDisplayPrice(product.priceNumber, product.priceUnit);
    flatRows.push({
      siteId,
      siteFavoriteKey: siteId || siteName,
      siteName: siteName.toLowerCase(),
      siteText: siteName.toLowerCase(),
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
  showSoldOutFilter.checked = params.get('showSoldOut') === '1';
  if (params.has('priceMin')) {
    priceMin.value = params.get('priceMin') || '';
  }
  if (params.has('priceMax')) {
    priceMax.value = params.get('priceMax') || '';
  }
  groupByMerchantFilter.checked = params.get('groupByMerchant') === '1';
  matchCategoryFilter.checked = params.get('matchCategory') === '1';
  matchMerchantFilter.checked = params.get('matchMerchant') === '1';
  applyFlatSortPreset(params.get('sort') || flatSortSelect?.value || 'default', { shouldApply: false });
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
  const query = searchFilter.value.trim();
  const reportQuery = parseSearchQuery(query).includeGroups.map(group => group.join('|')).join(' ');
  clearTimeout(searchReportTimer);
  if (reportQuery.length < 2 || reportQuery === lastReportedQuery) return;
  searchReportTimer = setTimeout(() => {
    lastReportedQuery = reportQuery;
    reportSearchTerm(reportQuery, filteredFlatRows().length);
  }, SEARCH_REPORT_DELAY_MS);
}

function currentFilterEventData(reason) {
  return {
    reason,
    query: searchFilter.value.trim(),
    priceMin: priceMin.value.trim(),
    priceMax: priceMax.value.trim(),
    showSoldOut: showSoldOutFilter.checked ? '1' : '0',
    groupByMerchant: groupByMerchantFilter.checked ? '1' : '0',
    matchCategory: matchCategoryFilter.checked ? '1' : '0',
    matchMerchant: matchMerchantFilter.checked ? '1' : '0',
    sort: flatSortSelect?.value || 'default',
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
}

function shouldResetSeoSearchPageTitle(searchQuery) {
  const seoSearchQuery = shopsMessages.seoSearchQuery || '';
  return Boolean(seoSearchQuery && searchQuery !== seoSearchQuery);
}

function resetSeoSearchPageTitle(searchQuery) {
  if (hasResetSeoSearchPageTitle || !shouldResetSeoSearchPageTitle(searchQuery)) return;
  if (shopsMessages.defaultPageTitle) document.title = shopsMessages.defaultPageTitle;
  if (shopPageHeroTitle && shopsMessages.defaultHeroTitle) shopPageHeroTitle.textContent = shopsMessages.defaultHeroTitle;
  if (shopPageHeroDescription && shopsMessages.defaultHeroDescription) shopPageHeroDescription.textContent = shopsMessages.defaultHeroDescription;
  hasResetSeoSearchPageTitle = true;
}

function renderQuickPlanFilters() {
  if (!quickPlanRow) return;
  const quickPlanItems = Array.from(quickPlanRow.querySelectorAll('[data-quick-plan-query]'));
  quickPlanItems.forEach((item, index) => {
    item.classList.toggle('hidden', !quickPlanExpanded && index >= QUICK_PLAN_VISIBLE_LIMIT);
  });

  if (quickPlanToggle && quickPlanItems.length > QUICK_PLAN_VISIBLE_LIMIT) {
    quickPlanToggle.className = 'btn btn-outline btn-sm text-sm! rounded-full border-base-300 font-semibold text-base-content/85 hover:text-base-content! hover:border-base-content/30! hover:bg-base-200!';
    quickPlanToggle.textContent = quickPlanExpanded
      ? (quickPlanToggle.dataset.lessLabel || 'Show less')
      : (quickPlanToggle.dataset.moreLabel || 'More');
    quickPlanToggle.classList.remove('hidden');
  } else if (quickPlanToggle) {
    quickPlanToggle.classList.add('hidden');
  }
}

function setQuickPlanExpanded(value) {
  quickPlanExpanded = value;
  renderQuickPlanFilters();
}

function initializeAdvancedSearchHelp() {
  if (!advancedSearchHelp) return;
  const tipText = advancedSearchHelp.dataset.tip || '';
  if (!tipText) return;
  const tipId = 'advanced-search-tip';
  advancedSearchHelp.setAttribute('aria-describedby', tipId);
  advancedSearchHelp.setAttribute('aria-expanded', 'false');
  const tip = document.createElement('div');
  tip.id = tipId;
  tip.className = 'advanced-search-tooltip hidden';
  tip.style.position = 'fixed';
  tip.style.zIndex = '9999';
  tip.style.maxWidth = '18rem';
  tip.style.border = '1px solid var(--color-base-300)';
  tip.style.borderRadius = '0.375rem';
  tip.style.background = 'var(--color-base-100)';
  tip.style.padding = '0.5rem 0.75rem';
  tip.style.textAlign = 'left';
  tip.style.fontSize = '0.75rem';
  tip.style.lineHeight = '1.25rem';
  tip.style.color = 'var(--color-base-content)';
  tip.style.boxShadow = '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)';
  tip.textContent = tipText;
  tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);

  const positionTip = () => {
    const triggerRect = advancedSearchHelp.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const viewportPadding = 12;
    const top = Math.min(
      window.innerHeight - tipRect.height - viewportPadding,
      triggerRect.bottom + 8,
    );
    const left = Math.min(
      window.innerWidth - tipRect.width - viewportPadding,
      Math.max(viewportPadding, triggerRect.right - tipRect.width),
    );
    tip.style.top = `${Math.max(viewportPadding, top)}px`;
    tip.style.left = `${left}px`;
  };

  const showTip = () => {
    tip.classList.remove('hidden');
    advancedSearchHelp.setAttribute('aria-expanded', 'true');
    positionTip();
  };

  const hideTip = () => {
    tip.classList.add('hidden');
    advancedSearchHelp.setAttribute('aria-expanded', 'false');
  };

  advancedSearchHelp.addEventListener('mouseenter', showTip);
  advancedSearchHelp.addEventListener('focus', showTip);
  advancedSearchHelp.addEventListener('mouseleave', hideTip);
  advancedSearchHelp.addEventListener('blur', hideTip);
  window.addEventListener('resize', () => {
    if (!tip.classList.contains('hidden')) positionTip();
  });
  window.addEventListener('scroll', () => {
    if (!tip.classList.contains('hidden')) positionTip();
  }, true);
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
    || options.groupByMerchant
    || options.searchQuery
    || options.showSoldOut
    || options.matchCategory
    || options.matchMerchant
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
  if (groupByMerchantFilter.checked) {
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
  const { includeGroups, excludeGroups } = parseSearchQuery(searchFilter.value);
  const includeTerms = includeGroups.flat();
  const showSoldOut = showSoldOutFilter.checked;
  const groupByMerchant = groupByMerchantFilter.checked;
  const priceMinValue = priceMin.value.trim();
  const priceMaxValue = priceMax.value.trim();
  const minPrice = parseBound(priceMinValue);
  const maxPrice = parseBound(priceMaxValue);
  const searchQuery = searchFilter.value.trim();
  const hasActiveFilters = Boolean(searchQuery || priceMinValue || priceMaxValue);
  let visibleFlatProductCount = 0;
  let visibleMerchantCount = 0;

  if (shouldLoadFullShopProductsData({
    groupByMerchant,
    searchQuery,
    showSoldOut,
    matchCategory: matchCategoryFilter.checked,
    matchMerchant: matchMerchantFilter.checked,
    priceMinValue,
    priceMaxValue,
  })) {
    const wasPartial = shopProductsDataIsPartial();
    await loadShopProductsDataFromApi();
    if (wasPartial && !shopProductsDataIsPartial()) {
      return;
    }
  }

  merchantGroupedView.hidden = !groupByMerchant;
  flatProductView.hidden = groupByMerchant;

  if (groupByMerchant) {
    const merchantModule = await loadMerchantViewModule();
    if (!merchantModule.isMerchantViewRendered()) {
      renderMerchantViewModule(merchantModule);
    }
    merchantModule.getMerchantRows().forEach(({ element: row, chips }) => {
      let visibleInStockCount = 0;
      let visibleSoldOutCount = 0;
      let visibleProductMatchCount = 0;

      chips.forEach(chip => {
        const productMatchCount = matchTermCount(chip.dataset.productTitle, includeTerms);
        const stockMatched = showSoldOut || chip.dataset.inStock === '1';
        const priceMatched = matchesPriceRange(Number(chip.dataset.priceValue), minPrice, maxPrice);
        const matchCategory = matchCategoryFilter.checked;
        const matchMerchant = matchMerchantFilter.checked;
        const chipMatchesTerm = term => {
          if ((chip.dataset.productName || '').includes(term)) return true;
          if (matchCategory && (chip.dataset.categoryName || '').includes(term)) return true;
          if (matchMerchant && (row.dataset.siteText || '').includes(term)) return true;
          return false;
        };
        const includeMatched = includeGroups.length === 0 || includeGroups.every(group => group.some(chipMatchesTerm));
        const excludeMatched = excludeGroups.length > 0 && excludeGroups.some(group => group.some(chipMatchesTerm));
        const queryMatched = includeMatched && !excludeMatched;
        const visible = queryMatched && stockMatched && priceMatched;
        chip.classList.toggle('hidden', !visible);
        if (visible) visibleProductMatchCount += productMatchCount;
        if (visible && chip.dataset.inStock !== '1') visibleSoldOutCount += 1;
        if (visible && chip.dataset.inStock === '1') visibleInStockCount += 1;
      });

      const visibleProductCount = visibleInStockCount + visibleSoldOutCount;
      const hasProducts = Number(row.dataset.productCount) > 0;
      const rowVisible = visibleProductCount > 0 || (!hasActiveFilters && !hasProducts);
      row.dataset.visibleProductMatchCount = String(visibleProductMatchCount);
      row.dataset.visibleInStockCount = String(visibleInStockCount);
      row.dataset.visibleSoldOutCount = String(visibleSoldOutCount);
      row.classList.toggle('hidden', !rowVisible);
    });

    visibleMerchantCount = sortRows(merchantModule);
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
    currentFlatRows.forEach(({ element: row }, index) => {
      row.classList.toggle('hidden', index >= renderedFlatCount);
    });
    updateFlatProductIndexes();
    updateFlatProgressiveLoadSummary(visibleFlatProductCount, renderedFlatCount);
  }

  const visibleCount = groupByMerchant ? visibleMerchantCount : visibleFlatProductCount;
  emptyState.classList.toggle('hidden', visibleCount > 0 || isShopProductsDataLoading);
  if (groupByMerchant) updateFlatProgressiveLoadSummary(0, 0);
  const params = new URLSearchParams();
  if (searchQuery) params.set('q', searchQuery);
  if (showSoldOut) params.set('showSoldOut', '1');
  if (groupByMerchant) params.set('groupByMerchant', '1');
  if (matchCategoryFilter.checked) params.set('matchCategory', '1');
  if (matchMerchantFilter.checked) params.set('matchMerchant', '1');
  if (priceMinValue) params.set('priceMin', priceMinValue);
  if (priceMaxValue) params.set('priceMax', priceMaxValue);
  if (flatSortSelect?.value && flatSortSelect.value !== 'default' && flatSortSelect.value !== 'custom') {
    params.set('sort', flatSortSelect.value);
  }
  resetSeoSearchPageTitle(searchQuery);
  const nextPath = shouldResetSeoSearchPageTitle(searchQuery) ? '/shops' : (window.location.pathname || '/shops');
  const nextUrl = params.toString() ? `${nextPath}?${params.toString()}` : nextPath;
  history.replaceState(null, '', nextUrl);
}

function sortRows(merchantModule) {
  if (!rowContainer) return 0;
  let visibleIndex = 0;

  merchantModule.getMerchantRows()
    .slice()
    .sort((a, b) => {
      const favoriteDiff = Number(b.element.dataset.favorite) - Number(a.element.dataset.favorite);
      if (favoriteDiff !== 0) return favoriteDiff;

      const siteScoreDiff = Number(b.element.dataset.siteScore) - Number(a.element.dataset.siteScore);
      if (siteScoreDiff !== 0) return siteScoreDiff;

      return Number(a.element.dataset.originalIndex) - Number(b.element.dataset.originalIndex);
    })
    .forEach(({ element: row, indexCell }, sortedIndex) => {
      row.dataset.sortedIndex = String(sortedIndex);
      rowContainer.appendChild(row);
      if (!row.classList.contains('hidden')) {
        visibleIndex += 1;
        if (indexCell) indexCell.textContent = String(visibleIndex);
      } else if (indexCell) {
        indexCell.textContent = '';
      }
    });

  return visibleIndex;
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

function flatSortPresetForState() {
  if (!currentFlatSort) return 'default';
  const entry = Object.entries(FLAT_SORT_PRESETS).find(([, preset]) => {
    return preset
      && preset.key === currentFlatSort.key
      && preset.direction === currentFlatSort.direction
      && preset.type === currentFlatSort.type;
  });
  return entry ? entry[0] : 'custom';
}

function syncFlatSortSelect() {
  if (!flatSortSelect) return;
  flatSortSelect.value = flatSortPresetForState();
}

function applyFlatSortPreset(value, options = {}) {
  const preset = FLAT_SORT_PRESETS[value] ?? null;
  currentFlatSort = preset ? { ...preset } : null;
  syncFlatSortSelect();
  if (options.shouldApply !== false) {
    resetFlatVisibleLimit();
    applyFilters();
  }
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
  syncFlatSortSelect();
}

function updateFlatSortButtons() {
  flatSortButtons.forEach(button => {
    const active = currentFlatSort?.key === button.dataset.sortKey;
    const headerCell = button.closest('th');
    const indicator = button.querySelector('.sort-indicator');
    const status = button.querySelector('.sort-status');
    const directionLabel = currentFlatSort?.direction === 'asc' ? (shopsMessages.ascending || 'ascending') : (shopsMessages.descending || 'descending');
    if (headerCell) headerCell.setAttribute('aria-sort', active ? (currentFlatSort.direction === 'asc' ? 'ascending' : 'descending') : 'none');
    button.dataset.sortDirection = active ? currentFlatSort.direction : '';
    if (indicator) indicator.dataset.sortDirection = active ? currentFlatSort.direction : '';
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
    emptyState.classList.add('hidden');
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
showSoldOutFilter.addEventListener('change', () => {
  resetFlatVisibleLimit();
  trackUmamiEvent('filter-toggle-click', {
    name: 'showSoldOut',
    value: showSoldOutFilter.checked ? '1' : '0',
  });
  applyFilters();
});
groupByMerchantFilter.addEventListener('change', () => {
  trackUmamiEvent('filter-toggle-click', {
    name: 'groupByMerchant',
    value: groupByMerchantFilter.checked ? '1' : '0',
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
matchMerchantFilter.addEventListener('change', () => {
  resetFlatVisibleLimit();
  trackUmamiEvent('filter-toggle-click', {
    name: 'matchMerchant',
    value: matchMerchantFilter.checked ? '1' : '0',
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
flatSortSelect?.addEventListener('change', () => {
  applyFlatSortPreset(flatSortSelect.value);
  trackUmamiEvent('product-sort-select', {
    value: flatSortSelect.value,
  });
});
quickTagFilters?.addEventListener('click', event => {
  const button = event.target.closest('button[data-tag-key]');
  if (!button) return;
  const tagKey = button.dataset.tagKey;
  const tag = quickSearchTags.find(item => item.key === tagKey);
  if (!tag) return;
  searchFilter.value = tag.label;
  resetFlatVisibleLimit();
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
  resetFlatVisibleLimit();
  applyFlatSortPreset('price-asc', { shouldApply: false });
  reportSearchTerm(query, filteredFlatRows().length);
  applyFilters();
  trackUmamiEvent('quick-plan-search-click', {
    name: button.textContent?.trim() || query,
    query,
  });
});
quickPlanToggle?.addEventListener('click', () => {
  setQuickPlanExpanded(!quickPlanExpanded);
  trackUmamiEvent('quick-plan-toggle-click', {
    expanded: quickPlanExpanded ? '1' : '0',
  });
});
flatProductLoadMoreButton?.addEventListener('click', () => {
  currentFlatVisibleLimit += FLAT_PRODUCT_LOAD_MORE_STEP;
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

document.querySelectorAll('.flat-sort-head').forEach(headerCell => {
  headerCell.addEventListener('click', event => {
    const button = headerCell.querySelector('.flat-sort-button');
    if (!(button instanceof HTMLElement) || event.target === button || button.contains(event.target)) return;
    button.click();
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
initializeAdvancedSearchHelp();
renderQuickPlanFilters();
syncFiltersFromUrl();
applyFilters();
