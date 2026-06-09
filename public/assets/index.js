/*
 * 文件说明: 首页商品表格筛选、排序、收藏与商家分组懒渲染交互。
 */
const searchFilter = document.querySelector('#searchFilter');
const showSoldOutFilter = document.querySelector('#showSoldOutFilter');
const groupByMerchantFilter = document.querySelector('#groupByMerchantFilter');
const priceMin = document.querySelector('#priceMin');
const priceMax = document.querySelector('#priceMax');
const quickTagFilters = document.querySelector('#quickTagFilters');
let dashboardData = JSON.parse(document.querySelector('#dashboard-data')?.textContent || '{"rows":[]}');
let flatProductRows = Array.from(document.querySelectorAll('.flat-product-row'));
const emptyState = document.querySelector('#emptyState');
const rowContainer = document.querySelector('#merchantRows');
const flatProductRowsContainer = document.querySelector('#flatProductRows');
const merchantGroupedView = document.querySelector('#merchantGroupedView');
const flatProductView = document.querySelector('#flatProductView');
const flatSortButtons = Array.from(document.querySelectorAll('.flat-sort-button'));
let favoriteButtons = Array.from(document.querySelectorAll('.favorite-toggle'));
let rows = [];
let merchantRows = [];
const flatRows = [];
const favoriteSiteStorageKey = 'cardnav.favoriteSites';
const favoriteProductStorageKey = 'cardnav.favoriteProducts';
let currentFlatSort = null;
let currentFlatRows = flatRows;
let merchantRowsRendered = false;
let favoriteSiteKeys = new Set();
let favoriteProductKeys = new Set();
let quickSearchTags = quickTagFilters
  ? Array.from(quickTagFilters.querySelectorAll('button[data-tag-key]')).map(button => toQuickSearchTag(button.textContent || ''))
  : [];
let applyFiltersTimer = null;
let searchReportTimer = null;
let umamiFilterReportTimer = null;
const SEARCH_REPORT_DELAY_MS = 5000;
let lastReportedQuery = '';
let lastReportedEmptyKey = '';
let lastReportedUmamiFilterKey = '';

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
  return normalize(value).split(/\s+/).filter(Boolean);
}

function matchesAllTerms(value, terms) {
  return terms.every(term => value.includes(term));
}

function matchTermCount(value, terms) {
  return terms.reduce((count, term) => count + (value.includes(term) ? 1 : 0), 0);
}

function matchesEveryTermAcrossProductAndSite(rowEntry, terms) {
  return terms.every(term => rowEntry.productTitle.includes(term) || rowEntry.siteText.includes(term));
}

function searchMatchedFlatRows() {
  const terms = searchTerms(searchFilter.value);
  if (terms.length === 0) return flatRows.slice();

  return flatRows.slice().sort((left, right) => {
    const productMatchDiff = matchTermCount(right.productTitle, terms) - matchTermCount(left.productTitle, terms);
    return productMatchDiff || left.originalIndex - right.originalIndex;
  });
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
  button.setAttribute('title', isFavorite ? (favoriteKind === 'site' ? '取消收藏商家' : '取消收藏商品') : (favoriteKind === 'site' ? '收藏商家' : '收藏商品'));
  if (row) row.dataset.favorite = isFavorite ? '1' : '0';
  if (icon) icon.textContent = isFavorite ? '♥' : '♡';
}

function renderFavoriteButtonsByKey(favoriteKind, key, isFavorite) {
  favoriteButtons
    .filter(button => button.dataset.favoriteKind === favoriteKind && button.dataset.favoriteKey === key)
    .forEach(button => renderFavoriteButton(button, isFavorite, favoriteKind));

  if (favoriteKind === 'site') {
    rows
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
    if (merchantRowsRendered) sortRows();
    if (currentFlatSort) sortFlatProductRows();
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

function parsePriceToCny(value) {
  const text = normalize(value);
  if (!text) return null;

  const compact = text.replace(/\s+/g, '');
  const rmbMatch = compact.match(/^¥\s*([0-9]+(?:\.[0-9]+)?)$/i);
  if (rmbMatch) return Number(rmbMatch[1]);

  const usdMatch = compact.match(/^\$\s*([0-9]+(?:\.[0-9]+)?)$/i);
  if (usdMatch) return Number(usdMatch[1]) * 7;

  return null;
}

function parseBound(value) {
  const text = String(value).trim();
  if (!text) return null;
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0) return null;
  return number;
}

function priceValueForSort(priceText) {
  const price = parsePriceToCny(priceText);
  return price === null ? -1 : price;
}

function productStockNumber(product) {
  const stock = Number(product.stock);
  return Number.isFinite(stock) && stock > 0 ? stock : null;
}

function productStockLabel(product, options = {}) {
  const stock = productStockNumber(product);
  if (stock !== null) return options.prefix ? `${options.prefix}${stock}` : String(stock);
  return product.inStock ? '有货' : '缺货';
}

function productStockValue(product) {
  return productStockNumber(product) ?? (product.inStock ? 1 : 0);
}

function buildFlatRows() {
  flatRows.length = 0;
  const entries = Array.isArray(dashboardData.rows) ? dashboardData.rows : [];
  const products = entries.flatMap((entry, siteIndex) => {
    const site = entry.site || {};
    return (Array.isArray(entry.products) ? entry.products : []).map((product, productIndex) => {
      const categoryName = text(product.categoryName);
      const productName = text(product.name);
      const productTitle = `${categoryName}-${productName}`;
      const priceText = text(product.price);
      const siteId = text(product.siteId || site.id);
      return {
        siteIndex,
        productIndex,
        siteId,
        siteName: text(site.name).toLowerCase(),
        siteText: text(site.name).toLowerCase(),
        categoryName: categoryName.toLowerCase(),
        productName: productName.toLowerCase(),
        productTitle: `${categoryName} ${productName} ${productTitle}`.toLowerCase(),
        priceText,
        priceValue: priceValueForSort(priceText),
        stockValue: productStockValue(product),
        inStock: product.inStock ? 1 : 0,
        score: Number(product.score) || 0,
        latestProductRefreshedAt: new Date(site.latestProductRefreshedAt || '').getTime() || 0,
      };
    });
  });

  flatProductRows.forEach((row, index) => {
    flatRows.push({
      ...products[index],
      element: row,
      indexCell: row.querySelector('.flat-row-index'),
      originalIndex: index,
    });
  });
}

function matchesPriceRange(priceText, min, max) {
  if (min === null && max === null) return true;

  const price = parsePriceToCny(priceText);
  if (price === null) return false;

  if (min !== null && price < min) return false;
  if (max !== null && price > max) return false;
  return true;
}

function syncFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('priceMin')) {
    priceMin.value = params.get('priceMin') || '';
  }
  if (params.has('priceMax')) {
    priceMax.value = params.get('priceMax') || '';
  }
  groupByMerchantFilter.checked = params.get('groupByMerchant') === '1';
}

function reportSearchTerm(term, source) {
  const normalizedTerm = normalize(term);
  if (!normalizedTerm || normalizedTerm.length < 2) return;
  if (/^https?:\/\//i.test(normalizedTerm) || /\/shop\//i.test(normalizedTerm) || /[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(normalizedTerm)) return;

  fetch('/api/search-terms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ term: normalizedTerm, source }),
    keepalive: true,
  }).catch(() => {});
}

function scheduleSearchReport() {
  const query = searchFilter.value.trim();
  clearTimeout(searchReportTimer);
  if (query.length < 2 || query === lastReportedQuery) return;
  searchReportTimer = setTimeout(() => {
    lastReportedQuery = query;
    reportSearchTerm(query, 'query');
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

function reportEmptyResultIfNeeded(visibleCount) {
  const query = searchFilter.value.trim();
  const term = query.trim();
  const reportKey = `${term}|${priceMin.value.trim()}|${priceMax.value.trim()}|${showSoldOutFilter.checked ? '1' : '0'}`;
  if (visibleCount > 0 || term.length < 2 || reportKey === lastReportedEmptyKey) return;
  lastReportedEmptyKey = reportKey;
  reportSearchTerm(term, 'empty');
}

function scheduleApplyFilters() {
  clearTimeout(applyFiltersTimer);
  applyFiltersTimer = setTimeout(applyFilters, 180);
}

function createFavoriteButton(favoriteKind, key, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'favorite-toggle';
  button.dataset.favoriteKind = favoriteKind;
  button.dataset.favoriteKey = key;
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-pressed', 'false');
  button.title = favoriteKind === 'site' ? '收藏商家' : '收藏商品';
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

function createFlatProductRow(entry, item) {
  const site = entry.site || {};
  const siteId = text(item.siteId || site.id);
  const siteName = text(site.name);
  const categoryName = text(item.categoryName);
  const productName = text(item.name);
  const productTitle = `${categoryName}-${productName}`;
  const productFavoriteKey = `${siteName}#${productTitle}`;
  const siteFavoriteKey = siteId || siteName;
  const row = document.createElement('tr');
  row.className = 'flat-product-row';

  const indexCell = appendTextElement(row, 'th', 'flat-row-index', '');
  indexCell.scope = 'row';

  const productCell = document.createElement('td');
  productCell.className = 'flat-product-cell';
  const productInline = document.createElement('div');
  productInline.className = 'cell-inline';
  productInline.appendChild(createFavoriteButton('product', productFavoriteKey, `收藏 ${productTitle}`));
  if (item.productUrl) {
    productInline.appendChild(createTrackedProductLink(item.productUrl, 'product-link', productName, productTitle));
  } else {
    appendTextElement(productInline, 'span', 'product-text', productName);
  }
  productCell.appendChild(productInline);
  row.appendChild(productCell);

  const priceCell = document.createElement('td');
  priceCell.className = 'flat-price-cell';
  priceCell.appendChild(document.createTextNode(text(item.price)));
  row.appendChild(priceCell);

  const statusCell = document.createElement('td');
  statusCell.className = 'flat-status-cell';
  appendTextElement(
    statusCell,
    'span',
    item.inStock ? 'stock-badge-in-stock' : 'stock-badge-sold-out',
    productStockLabel(item),
  );
  row.appendChild(statusCell);

  const categoryCell = document.createElement('td');
  categoryCell.className = 'flat-category-cell';
  categoryCell.appendChild(document.createTextNode(categoryName));
  row.appendChild(categoryCell);

  const merchantCell = document.createElement('td');
  merchantCell.className = 'flat-merchant-cell';
  const merchantInline = document.createElement('div');
  merchantInline.className = 'cell-inline';
  merchantInline.appendChild(createFavoriteButton('site', siteFavoriteKey, `收藏 ${siteName}`));
  appendTextElement(merchantInline, 'span', 'merchant-text', siteName);
  merchantCell.appendChild(merchantInline);
  row.appendChild(merchantCell);

  return row;
}

function renderFlatProductRowsFromData() {
  if (!flatProductRowsContainer) return;
  const entries = Array.isArray(dashboardData.rows) ? dashboardData.rows : [];
  const fragment = document.createDocumentFragment();

  entries.forEach(entry => {
    const products = Array.isArray(entry.products) ? entry.products : [];
    products.forEach(item => {
      fragment.appendChild(createFlatProductRow(entry, item));
    });
  });

  flatProductRowsContainer.replaceChildren(fragment);
  flatProductRows = Array.from(document.querySelectorAll('.flat-product-row'));
}

function createProductChip(item) {
  const categoryName = text(item.categoryName);
  const productName = text(item.name);
  const price = text(item.price);
  const productTitle = `${categoryName}-${productName}`;
  const shortCategory = categoryName.length > 10 ? `${categoryName.slice(0, 10)}...` : categoryName;
  const shortName = productName.length > 14 ? `${productName.slice(0, 14)}...` : productName;
  const chip = item.productUrl ? document.createElement('a') : document.createElement('div');

  chip.title = productTitle;
  chip.dataset.productTitle = productTitle.toLowerCase();
  chip.dataset.priceText = price;
  chip.dataset.inStock = item.inStock ? '1' : '0';
  chip.dataset.stockValue = String(productStockValue(item));
  chip.dataset.latestProductRefreshedAt = String(new Date(item.latestProductRefreshedAt || '').getTime() || 0);
  chip.className = item.productUrl
    ? (item.inStock ? 'product-chip-link-in-stock' : 'product-chip-link-sold-out')
    : (item.inStock ? 'product-chip-static-in-stock' : 'product-chip-static-sold-out');

  if (item.productUrl) {
    chip.href = item.productUrl;
    chip.target = '_blank';
    chip.rel = 'noopener noreferrer';
    chip.dataset.umamiEvent = 'product-click';
    chip.dataset.umamiEventUrl = item.productUrl;
    chip.dataset.umamiEventName = productTitle;
  }

  appendTextElement(chip, 'span', 'product-category', shortCategory);
  appendTextElement(chip, 'span', 'product-name', shortName);
  appendTextElement(chip, 'span', 'product-price', price);
  appendTextElement(
    chip,
    'span',
    item.inStock ? 'product-status-in-stock' : 'product-status-sold-out',
    productStockLabel(item, { prefix: '库存 ' }),
  );

  return chip;
}

function renderMerchantRows() {
  if (merchantRowsRendered || !rowContainer) return;
  const entries = Array.isArray(dashboardData.rows) ? dashboardData.rows : [];
  const fragment = document.createDocumentFragment();

  entries.forEach((entry, index) => {
    const site = entry.site || {};
    const products = Array.isArray(entry.products) ? entry.products : [];
    const siteId = text(site.id);
    const siteName = text(site.name);
    const siteFavoriteKey = siteId || siteName;
    const row = document.createElement('div');
    row.className = 'merchant-row';
    row.dataset.siteId = siteFavoriteKey;
    row.dataset.siteText = siteName.toLowerCase();
    row.dataset.siteName = siteName;
    row.dataset.latestProductRefreshedAt = String(new Date(site.latestProductRefreshedAt || '').getTime() || 0);
    row.dataset.originalIndex = String(index);
    row.dataset.productCount = String(products.length);

    const indexCell = appendTextElement(row, 'div', 'row-index merchant-row-index', '');
    const merchantCell = document.createElement('div');
    merchantCell.className = 'merchant-cell';
    const merchantHeader = document.createElement('div');
    merchantHeader.className = 'merchant-header';
    merchantHeader.appendChild(createFavoriteButton('site', siteFavoriteKey, `收藏 ${siteName}`));
    appendTextElement(merchantHeader, 'span', 'merchant-primary-text', siteName);
    merchantCell.appendChild(merchantHeader);
    if (site.latestProductRefreshTime) {
      appendTextElement(merchantCell, 'div', 'merchant-refresh-time', `最近刷新：${site.latestProductRefreshTime}`);
    }
    row.appendChild(merchantCell);

    const productsCell = document.createElement('div');
    productsCell.className = 'merchant-product-cell';
    const chips = [];
    if (products.length === 0) {
      appendTextElement(productsCell, 'div', 'no-products', '暂无数据');
    } else {
      const list = document.createElement('div');
      list.className = 'product-list';
      products.forEach(item => {
        const chip = createProductChip(item);
        chips.push(chip);
        list.appendChild(chip);
      });
      productsCell.appendChild(list);
    }
    row.appendChild(productsCell);
    fragment.appendChild(row);
    merchantRows.push({ element: row, indexCell, chips });
  });

  rowContainer.appendChild(fragment);
  rows = merchantRows.map(row => row.element);
  const newFavoriteButtons = Array.from(rowContainer.querySelectorAll('.favorite-toggle'));
  favoriteButtons = Array.from(new Set([...favoriteButtons, ...newFavoriteButtons]));
  initializeFavorites(newFavoriteButtons);
  merchantRowsRendered = true;
}

function applyFilters() {
  const terms = searchTerms(searchFilter.value);
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

  merchantGroupedView.hidden = !groupByMerchant;
  flatProductView.hidden = groupByMerchant;

  if (groupByMerchant) {
    renderMerchantRows();
    merchantRows.forEach(({ element: row, chips }) => {
      let visibleInStockCount = 0;
      let visibleSoldOutCount = 0;
      let visibleProductMatchCount = 0;

      chips.forEach(chip => {
        const combinedText = `${chip.dataset.productTitle || ''} ${row.dataset.siteText || ''}`;
        const productMatchCount = matchTermCount(chip.dataset.productTitle, terms);
        const stockMatched = showSoldOut || chip.dataset.inStock === '1';
        const priceMatched = matchesPriceRange(chip.dataset.priceText, minPrice, maxPrice);
        const queryMatched = terms.length === 0 || matchesAllTerms(combinedText, terms);
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

    visibleMerchantCount = sortRows();
  } else {
    flatRows.forEach(rowEntry => {
      const row = rowEntry.element;
      const productMatchCount = matchTermCount(rowEntry.productTitle, terms);
      const productMatched = productMatchCount > 0;
      const stockMatched = showSoldOut || rowEntry.inStock === 1;
      const priceMatched = matchesPriceRange(rowEntry.priceText, minPrice, maxPrice);
      const queryMatched = terms.length === 0 || matchesEveryTermAcrossProductAndSite(rowEntry, terms);
      const visible = queryMatched && stockMatched && priceMatched;
      row.dataset.productMatched = productMatched ? '1' : '0';
      row.classList.toggle('hidden', !visible);
      if (visible) visibleFlatProductCount += 1;
    });

    if (currentFlatSort) {
      sortFlatProductRows();
    } else {
      currentFlatRows = searchMatchedFlatRows();
      appendCurrentFlatRows();
      updateFlatProductIndexes();
    }
  }

  const visibleCount = groupByMerchant ? visibleMerchantCount : visibleFlatProductCount;
  emptyState.classList.toggle('hidden', visibleCount > 0);
  reportEmptyResultIfNeeded(visibleCount);
  const params = new URLSearchParams();
  if (searchQuery) params.set('q', searchQuery);
  if (!showSoldOut) params.set('showSoldOut', '0');
  if (groupByMerchant) params.set('groupByMerchant', '1');
  if (priceMinValue) params.set('priceMin', priceMinValue);
  if (priceMaxValue) params.set('priceMax', priceMaxValue);
  const nextUrl = params.toString() ? `/?${params.toString()}` : '/';
  history.replaceState(null, '', nextUrl);
}

function sortRows() {
  if (!rowContainer) return 0;
  let visibleIndex = 0;

  merchantRows
    .slice()
    .sort((a, b) => {
      const favoriteDiff = Number(b.element.dataset.favorite) - Number(a.element.dataset.favorite);
      if (favoriteDiff !== 0) return favoriteDiff;

      const productMatchDiff = Number(b.element.dataset.visibleProductMatchCount) - Number(a.element.dataset.visibleProductMatchCount);
      if (productMatchDiff !== 0) return productMatchDiff;

      const inStockDiff = Number(b.element.dataset.visibleInStockCount) - Number(a.element.dataset.visibleInStockCount);
      if (inStockDiff !== 0) return inStockDiff;

      const soldOutDiff = Number(b.element.dataset.visibleSoldOutCount) - Number(a.element.dataset.visibleSoldOutCount);
      if (soldOutDiff !== 0) return soldOutDiff;

      const refreshDiff = Number(b.element.dataset.latestProductRefreshedAt) - Number(a.element.dataset.latestProductRefreshedAt);
      if (refreshDiff !== 0) return refreshDiff;

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
  currentFlatRows.forEach(({ element: row }) => {
    flatProductRowsContainer?.appendChild(row);
  });
}

function sortFlatProductRows(button) {
  if (button) {
    const key = button.dataset.sortKey;
    const currentDirection = currentFlatSort?.key === key ? currentFlatSort.direction : null;
    const direction = currentDirection === 'asc' ? 'desc' : (currentDirection === 'desc' ? null : 'asc');
    currentFlatSort = direction ? { key, direction, type: button.dataset.sortType || 'text' } : null;
  }

  const sortedRows = flatRows.slice();
  if (currentFlatSort) {
    const multiplier = currentFlatSort.direction === 'asc' ? 1 : -1;
    sortedRows.sort((left, right) => {
      const leftValue = flatRowValue(left, currentFlatSort.key, currentFlatSort.type);
      const rightValue = flatRowValue(right, currentFlatSort.key, currentFlatSort.type);
      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        return (leftValue - rightValue) * multiplier;
      }
      return String(leftValue).localeCompare(String(rightValue), 'zh-Hans-CN', { numeric: true }) * multiplier;
    });
  }

  currentFlatRows = sortedRows;
  appendCurrentFlatRows();
  updateFlatProductIndexes();
  updateFlatSortButtons();
}

function updateFlatSortButtons() {
  flatSortButtons.forEach(button => {
    const active = currentFlatSort?.key === button.dataset.sortKey;
    const headerCell = button.closest('th');
    const indicator = button.querySelector('.sort-indicator');
    const status = button.querySelector('.sort-status');
    const directionLabel = currentFlatSort?.direction === 'asc' ? '升序' : '降序';
    if (headerCell) headerCell.setAttribute('aria-sort', active ? (currentFlatSort.direction === 'asc' ? 'ascending' : 'descending') : 'none');
    button.dataset.sortDirection = active ? currentFlatSort.direction : '';
    if (indicator) indicator.textContent = active ? (currentFlatSort.direction === 'asc' ? '↑' : '↓') : '';
    if (status) status.textContent = active ? `，当前${directionLabel}` : '，点击排序';
  });
}

function replaceDashboardData(nextDashboardData) {
  if (!nextDashboardData || !Array.isArray(nextDashboardData.rows)) return;

  dashboardData = nextDashboardData;
  merchantRowsRendered = false;
  merchantRows = [];
  rows = [];
  if (rowContainer) rowContainer.replaceChildren();
  renderFlatProductRowsFromData();
  currentFlatRows = flatRows;
  buildFlatRows();
  favoriteButtons = Array.from(document.querySelectorAll('.favorite-toggle'));
  initializeFavorites();
  if (currentFlatSort) sortFlatProductRows();
  applyFilters();
}

async function loadDashboardDataFromApi() {
  try {
    const response = await fetch('/api/dashboard', { headers: { accept: 'application/json' } });
    if (!response.ok) return;
    replaceDashboardData(await response.json());
  } catch (_error) {
    // SSR rows remain usable when the API request fails.
  }
}

searchFilter.addEventListener('input', () => {
  scheduleSearchReport();
  scheduleFilterTrack('query');
  scheduleApplyFilters();
});
showSoldOutFilter.addEventListener('change', () => {
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
priceMin.addEventListener('input', () => {
  scheduleFilterTrack('priceMin');
  scheduleApplyFilters();
});
priceMax.addEventListener('input', () => {
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
  reportSearchTerm(tag.label, 'tag');
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
buildFlatRows();
loadFavorites();
initializeFavorites();
syncFiltersFromUrl();
applyFilters();
loadDashboardDataFromApi();
