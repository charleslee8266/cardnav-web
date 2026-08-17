/*
 * 文件说明: 商家列表视图的懒加载模块，按商家渲染评分、商品数量、热门商品和刷新时间。
 */
let merchantRowsRendered = false;
let merchantRows = [];
let rows = [];

export function isMerchantViewRendered() {
  return merchantRowsRendered;
}

export function resetMerchantViewState() {
  merchantRowsRendered = false;
  merchantRows = [];
  rows = [];
  const rowContainer = document.querySelector('#merchantRows');
  if (rowContainer) rowContainer.replaceChildren();
}

export function getMerchantRows() {
  return merchantRows;
}

export function getMerchantRowElements() {
  return rows;
}

function text(value) {
  return String(value ?? '').trim();
}

function appendTextElement(parent, tagName, className, content) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = content;
  parent.appendChild(element);
  return element;
}

function localizedFallbackPath(pathname) {
  const normalizedPathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const [, maybeLocale] = window.location.pathname.split('/');
  return ['en', 'ru'].includes(maybeLocale) ? `/${maybeLocale}${normalizedPathname}` : normalizedPathname;
}

function formatDisplayPrice(priceNumber, priceUnit) {
  if (typeof priceNumber === 'number' && Number.isFinite(priceNumber) && priceUnit) {
    return `${priceUnit}${String(priceNumber)}`;
  }
  return '';
}

function productStockValue(item, accessors) {
  const stock = Number(accessors.shopProductStock(item));
  return Number.isFinite(stock) && stock > 0 ? stock : (accessors.shopProductInStock(item) ? 1 : 0);
}

function productScoreValue(item, accessors) {
  const score = Number(accessors.shopProductScore(item));
  return Number.isFinite(score) ? score : 0;
}

function productStockLabel(item, shopsMessages, accessors) {
  const stock = Number(accessors.shopProductStock(item));
  if (Number.isFinite(stock) && stock > 0) return String(stock);
  return accessors.shopProductInStock(item) ? (shopsMessages.inStock || 'In stock') : (shopsMessages.soldOut || 'Sold out');
}

function formatScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return '-';
  return Number.isInteger(score) ? String(score) : score.toFixed(2);
}

function priceValueForSort(priceNumber, priceUnit) {
  if (typeof priceNumber !== 'number' || !Number.isFinite(priceNumber)) return Number.MAX_SAFE_INTEGER;
  if (priceUnit === '$' || priceUnit === 'USD') return priceNumber * 7;
  return priceNumber;
}

function createTrackedMerchantLink(siteUrl, siteName, createTrackedLink, options = {}) {
  return createTrackedLink(siteUrl, 'merchant-link merchant-text', siteName, siteName, {
    umamiEvent: 'merchant-click',
    productClick: false,
    sponsor: options.sponsor === true,
  });
}

function createProductChip(item, shopProductsData, shopsMessages, createTrackedLink, accessors) {
  const site = accessors.shopProductSite(shopProductsData, item);
  const siteSponsor = accessors.shopSiteSponsor(site);
  const categoryName = text(accessors.shopProductCategoryName(shopProductsData, item));
  const productName = text(accessors.shopProductName(item));
  const priceNumber = accessors.shopProductPriceNumber(item);
  const priceUnit = accessors.shopProductPriceUnit(shopProductsData, item);
  const productUrl = accessors.shopProductUrl(item);
  const inStock = accessors.shopProductInStock(item);
  const price = formatDisplayPrice(priceNumber, priceUnit);
  const productTitle = `${categoryName}-${productName}`;
  const shortCategory = categoryName.length > 10 ? `${categoryName.slice(0, 10)}...` : categoryName;
  const shortName = productName.length > 14 ? `${productName.slice(0, 14)}...` : productName;
  const chip = productUrl ? document.createElement('a') : document.createElement('div');

  chip.title = productTitle;
  chip.dataset.productTitle = productTitle.toLowerCase();
  chip.dataset.productName = productName.toLowerCase();
  chip.dataset.categoryName = categoryName.toLowerCase();
  chip.dataset.priceValue = String(priceValueForSort(priceNumber, priceUnit));
  chip.dataset.inStock = inStock ? '1' : '0';
  chip.dataset.stockValue = String(productStockValue(item, accessors));
  chip.dataset.productRefreshedAt = String(accessors.shopProductRefreshedMs(item) || 0);
  chip.className = productUrl
    ? (inStock ? 'product-chip-link-in-stock' : 'product-chip-link-sold-out')
    : (inStock ? 'product-chip-static-in-stock' : 'product-chip-static-sold-out');

  if (productUrl) {
    chip.href = productUrl;
    chip.target = '_blank';
    chip.rel = 'noopener noreferrer';
    if (siteSponsor) chip.rel = 'noopener noreferrer sponsored';
    chip.dataset.umamiEvent = 'product-click';
    chip.dataset.umamiEventUrl = productUrl;
    chip.dataset.umamiEventName = productTitle;
    chip.dataset.productClickSiteId = text(accessors.shopSiteId(site));
    chip.dataset.productClickUrl = productUrl;
    chip.dataset.productClickCategory = categoryName;
    chip.dataset.productClickName = productName;
  }

  appendTextElement(chip, 'span', 'product-category', shortCategory);
  appendTextElement(chip, 'span', 'product-name', shortName);
  appendTextElement(chip, 'span', 'product-price', price);
  appendTextElement(
    chip,
    'span',
    inStock ? 'product-status-in-stock' : 'product-status-sold-out',
    productStockLabel(item, shopsMessages, accessors),
  );

  return chip;
}

export function renderMerchantRows({
  shopProductsData,
  shopDataAccessors,
  shopsMessages,
  createFavoriteButton,
  createTrackedLink,
  initializeFavorites,
  getFavoriteButtons,
  setFavoriteButtons,
}) {
  const rowContainer = document.querySelector('#merchantRows');
  if (merchantRowsRendered || !rowContainer) return;

  const accessors = shopDataAccessors;
  const sites = accessors.shopSites(shopProductsData);
  const products = accessors.shopProducts(shopProductsData);
  const productsBySiteId = new Map();
  products.forEach(item => {
    const siteId = text(accessors.shopSiteId(accessors.shopProductSite(shopProductsData, item)));
    const items = productsBySiteId.get(siteId) ?? [];
    items.push(item);
    productsBySiteId.set(siteId, items);
  });
  const fragment = document.createDocumentFragment();

  sites.forEach((site, index) => {
    const siteId = text(accessors.shopSiteId(site));
    const siteProducts = productsBySiteId.get(siteId) ?? [];
    const hotProducts = siteProducts
      .slice()
      .sort((left, right) => {
        const stockDiff = Number(accessors.shopProductInStock(right)) - Number(accessors.shopProductInStock(left));
        if (stockDiff !== 0) return stockDiff;
        const scoreDiff = productScoreValue(right, accessors) - productScoreValue(left, accessors);
        if (scoreDiff !== 0) return scoreDiff;
        return text(accessors.shopProductName(left)).localeCompare(text(accessors.shopProductName(right)), 'zh-Hans-CN', { numeric: true });
      })
      .slice(0, 10);
    const siteName = text(accessors.shopSiteName(site));
    const siteUrl = text(accessors.shopSiteUrl(site)).trim();
    const siteSponsor = accessors.shopSiteSponsor(site);
    const siteFavoriteKey = siteId || siteName;
    const row = document.createElement('div');
    row.className = 'merchant-row';
    row.dataset.siteId = siteFavoriteKey;
    row.dataset.siteText = siteName.toLowerCase();
    row.dataset.siteUrl = siteUrl.toLowerCase();
    row.dataset.siteName = siteName;
    row.dataset.siteScore = String(accessors.shopSiteScore(site));
    row.dataset.sponsor = siteSponsor ? '1' : '0';
    row.dataset.lastProductRefreshSuccessAt = String(accessors.shopSiteLastRefreshMs(site) || 0);
    row.dataset.originalIndex = String(index);
    row.dataset.rank = String(index + 1);
    row.dataset.sequence = String(index + 1);
    row.dataset.productCount = String(siteProducts.length);
    row.dataset.hotProducts = String(hotProducts.length > 0 ? productScoreValue(hotProducts[0], accessors) : 0);

    const indexCell = appendTextElement(row, 'div', 'row-index merchant-table-cell merchant-table-cell-index data-table-sequence-cell', '');
    const merchantCell = document.createElement('div');
    merchantCell.className = 'merchant-table-cell merchant-table-cell-merchant';
    const merchantHeader = document.createElement('div');
    merchantHeader.className = 'merchant-header';
    merchantHeader.appendChild(createFavoriteButton('site', siteFavoriteKey, `${shopsMessages.merchantFavorite || 'Favorite merchant'} ${siteName}`));
    if (siteUrl) {
      merchantHeader.appendChild(createTrackedMerchantLink(siteUrl, siteName, createTrackedLink, { sponsor: siteSponsor }));
    } else {
      appendTextElement(merchantHeader, 'span', 'merchant-primary-text', siteName);
    }
    if (siteSponsor) merchantHeader.appendChild(window.CardNavSponsorBadge.create(shopsMessages.sponsorLabel || 'Partner', shopsMessages.sponsorDescription || '', shopsMessages.partnershipUrl || localizedFallbackPath('/partnership'), shopsMessages.partnershipLinkLabel || 'How to partner'));
    merchantCell.appendChild(merchantHeader);
    row.appendChild(merchantCell);

    const productsCell = document.createElement('div');
    productsCell.className = 'merchant-table-cell merchant-table-cell-value data-table-cell-align-right';
    appendTextElement(productsCell, 'span', 'merchant-table-mobile-label', shopsMessages.tableLabels?.productCount || 'Product count');
    appendTextElement(productsCell, 'span', 'merchant-table-value', String(siteProducts.length));
    row.appendChild(productsCell);

    const hotProductsCell = document.createElement('div');
    hotProductsCell.className = 'merchant-table-cell merchant-table-cell-products';
    appendTextElement(
      hotProductsCell,
      'div',
      'merchant-table-mobile-label merchant-table-products-mobile-label',
      shopsMessages.hotProductsTitle || 'Hot products',
    );
    const chips = [];
    if (hotProducts.length === 0) {
      appendTextElement(hotProductsCell, 'div', 'no-products', shopsMessages.noData || 'No data');
    } else {
      const list = document.createElement('div');
      list.className = 'product-list';
      hotProducts.forEach(item => {
        const chip = createProductChip(item, shopProductsData, shopsMessages, createTrackedLink, accessors);
        chips.push(chip);
        list.appendChild(chip);
      });
      hotProductsCell.appendChild(list);
    }
    row.appendChild(hotProductsCell);

    const scoreCell = document.createElement('div');
    scoreCell.className = 'merchant-table-cell merchant-table-cell-value data-table-cell-align-right';
    appendTextElement(scoreCell, 'span', 'merchant-table-mobile-label', shopsMessages.tableLabels?.merchantScore || 'Merchant score');
    appendTextElement(scoreCell, 'span', 'merchant-table-value', formatScore(accessors.shopSiteScore(site)));
    row.appendChild(scoreCell);

    const refreshCell = document.createElement('div');
    refreshCell.className = 'merchant-table-cell merchant-table-cell-value';
    appendTextElement(refreshCell, 'span', 'merchant-table-mobile-label', shopsMessages.tableLabels?.latestRefresh || 'Latest refresh');
    appendTextElement(refreshCell, 'span', 'merchant-table-value', accessors.shopSiteLastRefreshTime(site) || '-');
    row.appendChild(refreshCell);

    fragment.appendChild(row);
    merchantRows.push({ element: row, indexCell, chips });
  });

  rowContainer.appendChild(fragment);
  rows = merchantRows.map(row => row.element);
  const newFavoriteButtons = Array.from(rowContainer.querySelectorAll('.favorite-toggle'));
  setFavoriteButtons(Array.from(new Set([...getFavoriteButtons(), ...newFavoriteButtons])));
  initializeFavorites(newFavoriteButtons);
  merchantRowsRendered = true;
}
