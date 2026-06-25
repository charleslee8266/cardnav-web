/*
 * 文件说明: 商家分组视图的懒加载模块，仅在启用按商家分组时加载。
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

function formatDisplayPrice(priceNumber, priceUnit) {
  if (typeof priceNumber === 'number' && Number.isFinite(priceNumber) && priceUnit) {
    return `${priceUnit}${String(priceNumber)}`;
  }
  return '';
}

function productStockValue(item) {
  return typeof item.stock === 'number' && item.stock > 0 ? item.stock : (item.inStock ? 1 : 0);
}

function productStockLabel(item, shopsMessages) {
  if (typeof item.stock === 'number' && item.stock > 0) return String(item.stock);
  return item.inStock ? (shopsMessages.inStock || 'In stock') : (shopsMessages.soldOut || 'Sold out');
}

function priceValueForSort(priceNumber, priceUnit) {
  if (typeof priceNumber !== 'number' || !Number.isFinite(priceNumber)) return Number.MAX_SAFE_INTEGER;
  if (priceUnit === '$' || priceUnit === 'USD') return priceNumber * 7;
  return priceNumber;
}

function createTrackedMerchantLink(siteUrl, siteName, createTrackedLink) {
  return createTrackedLink(siteUrl, 'merchant-link merchant-text', siteName, siteName, {
    umamiEvent: 'merchant-click',
    productClick: false,
  });
}

function createProductChip(item, shopsMessages, createTrackedLink) {
  const categoryName = text(item.categoryName);
  const productName = text(item.name);
  const price = formatDisplayPrice(item.priceNumber, item.priceUnit);
  const productTitle = `${categoryName}-${productName}`;
  const shortCategory = categoryName.length > 10 ? `${categoryName.slice(0, 10)}...` : categoryName;
  const shortName = productName.length > 14 ? `${productName.slice(0, 14)}...` : productName;
  const chip = item.productUrl ? document.createElement('a') : document.createElement('div');

  chip.title = productTitle;
  chip.dataset.productTitle = productTitle.toLowerCase();
  chip.dataset.productName = productName.toLowerCase();
  chip.dataset.categoryName = categoryName.toLowerCase();
  chip.dataset.priceValue = String(priceValueForSort(item.priceNumber, item.priceUnit));
  chip.dataset.inStock = item.inStock ? '1' : '0';
  chip.dataset.stockValue = String(productStockValue(item));
  chip.dataset.productRefreshedAt = String(new Date(item.refreshedAt || '').getTime() || 0);
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
    chip.dataset.productClickSiteId = text(item.siteId);
    chip.dataset.productClickUrl = item.productUrl;
    chip.dataset.productClickCategory = categoryName;
    chip.dataset.productClickName = productName;
  }

  appendTextElement(chip, 'span', 'product-category', shortCategory);
  appendTextElement(chip, 'span', 'product-name', shortName);
  appendTextElement(chip, 'span', 'product-price', price);
  appendTextElement(
    chip,
    'span',
    item.inStock ? 'product-status-in-stock' : 'product-status-sold-out',
    productStockLabel(item, shopsMessages),
  );

  return chip;
}

export function renderMerchantRows({
  shopProductsData,
  shopsMessages,
  createFavoriteButton,
  createTrackedLink,
  initializeFavorites,
  getFavoriteButtons,
  setFavoriteButtons,
}) {
  const rowContainer = document.querySelector('#merchantRows');
  if (merchantRowsRendered || !rowContainer) return;

  const sites = Array.isArray(shopProductsData.sites) ? shopProductsData.sites : [];
  const products = Array.isArray(shopProductsData.products) ? shopProductsData.products : [];
  const productsBySiteId = new Map();
  products.forEach(item => {
    const siteId = text(item.siteId);
    const items = productsBySiteId.get(siteId) ?? [];
    items.push(item);
    productsBySiteId.set(siteId, items);
  });
  const fragment = document.createDocumentFragment();

  sites.forEach((site, index) => {
    const siteId = text(site.id);
    const siteProducts = productsBySiteId.get(siteId) ?? [];
    const siteName = text(site.name);
    const siteUrl = text(site.url).trim();
    const siteFavoriteKey = siteId || siteName;
    const row = document.createElement('div');
    row.className = 'merchant-row';
    row.dataset.siteId = siteFavoriteKey;
    row.dataset.siteText = siteName.toLowerCase();
    row.dataset.siteName = siteName;
    row.dataset.siteScore = String(Number(site.score) || 0);
    row.dataset.lastProductRefreshSuccessAt = String(new Date(site.lastProductRefreshSuccessAt || '').getTime() || 0);
    row.dataset.originalIndex = String(index);
    row.dataset.productCount = String(siteProducts.length);

    const indexCell = appendTextElement(row, 'div', 'row-index merchant-row-index', '');
    const merchantCell = document.createElement('div');
    merchantCell.className = 'merchant-cell';
    const merchantHeader = document.createElement('div');
    merchantHeader.className = 'merchant-header';
    merchantHeader.appendChild(createFavoriteButton('site', siteFavoriteKey, `${shopsMessages.merchantFavorite || 'Favorite merchant'} ${siteName}`));
    if (siteUrl) {
      merchantHeader.appendChild(createTrackedMerchantLink(siteUrl, siteName, createTrackedLink));
    } else {
      appendTextElement(merchantHeader, 'span', 'merchant-primary-text', siteName);
    }
    merchantCell.appendChild(merchantHeader);
    if (site.lastProductRefreshSuccessTime) {
      appendTextElement(merchantCell, 'div', 'merchant-refresh-time', `${shopsMessages.latestRefreshPrefix || 'Last refresh: '}${site.lastProductRefreshSuccessTime}`);
    }
    row.appendChild(merchantCell);

    const productsCell = document.createElement('div');
    productsCell.className = 'merchant-product-cell';
    const chips = [];
    if (siteProducts.length === 0) {
      appendTextElement(productsCell, 'div', 'no-products', shopsMessages.noData || 'No data');
    } else {
      const list = document.createElement('div');
      list.className = 'product-list';
      siteProducts.forEach(item => {
        const chip = createProductChip(item, shopsMessages, createTrackedLink);
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
  setFavoriteButtons(Array.from(new Set([...getFavoriteButtons(), ...newFavoriteButtons])));
  initializeFavorites(newFavoriteButtons);
  merchantRowsRendered = true;
}