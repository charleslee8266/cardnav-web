import { createScoreDisplay } from '../data-display.js';
import { gatewayModelPath } from '../models/routes.js';
import { renderFilterSummary } from './filter-summary.js';
/*
 * 文件说明: 管理中转站分组报价的筛选、渐进渲染与全量排序。
 */
import { displayPriceUnit as unitLabel, matchesPriceUnit, comparePriceUnits, priceMetrics } from '../gateway-display.js';
import { setTableRowSequence } from './table-sequence.js';
import { selectModelSiteQuotes } from '../model-site-quotes.js';
import { GatewayFavorites } from './GatewayFavorites.js';

(() => {
  const root = document.querySelector('[data-gateway-deferred-table]');
  if (!root) return;

  const config = JSON.parse(document.getElementById('gateway-deferred-table-config')?.textContent || '{}');
  function localizedFallbackPath(pathname) {
    const normalizedPathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
    const [, maybeLocale] = window.location.pathname.split('/');
    return ['en', 'ru'].includes(maybeLocale) ? `/${maybeLocale}${normalizedPathname}` : normalizedPathname;
  }

  const gatewayLinkPrefix = config.gatewayLinkPrefix || localizedFallbackPath('/llm-gateway');
  const modelLinkPrefix = config.modelLinkPrefix || localizedFallbackPath('/llm-gateway/models');
  const partnershipUrl = config.partnershipUrl || localizedFallbackPath('/partnership');
  const table = root.querySelector('[data-table]');
  const tbody = table?.querySelector('tbody');
  const button = root.querySelector('[data-gateway-detail-load-more]');
  const summary = root.querySelector('[data-table-summary]');
  if (!(table instanceof HTMLElement) || !tbody) return;
  const tableType = config.type || root.dataset.gatewayDeferredTable || '';
  const favorites = new GatewayFavorites(root, { favorite: config.favoriteLabel, unfavorite: config.unfavoriteLabel }, () => { refreshFavorites(); });

  function refreshFavorites() { render(); }

  function el(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function setDataset(node, values) {
    Object.entries(values).forEach(([key, value]) => {
      node.dataset[key] = String(value);
    });
  }

  function tableCell(label, align = 'left', className = '', options = {}) {
    const cell = document.createElement('td');
    cell.dataset.label = label;
    if (options.sequence) cell.setAttribute('data-table-sequence-cell', '');
    cell.className = [
      'data-table-cell',
      `data-table-cell-align-${align}`,
      options.sequence ? 'data-table-sequence-cell' : '',
      className,
    ].filter(Boolean).join(' ');
    return cell;
  }

  function priceSortValue(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : '';
  }

  function formatPrice(value) {
    return value === null || !Number.isFinite(value) ? '-' : value.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }

  function displayPriceUnit(unit, currency) { return unitLabel(unit, currency, config.groupLabels); }

  function firstFinite(values) {
    const value = values.find(item => typeof item === 'number' && Number.isFinite(item));
    return typeof value === 'number' ? value : '';
  }

  function groupCell(price) {
    const cell = tableCell(config.groupLabels.group);
    const label = el('span', 'inline-flex items-center gap-1 font-medium', price?.groupName || '—');
    if (price?.groupDescription) {
      const help = el('button', 'inline-help-button', 'i');
      help.type = 'button'; help.dataset.inlineHelp = ''; help.setAttribute('aria-label', config.groupLabels.groupDescription);
      const template = document.createElement('template'); template.dataset.tipContent = '';
      template.content.append(el('span', 'whitespace-pre-wrap', price.groupDescription)); help.append(template);
      label.append(help);
    }
    cell.append(label);
    return cell;
  }

  function priceRowElement(price, index) {
    const labels = config.labels || {};
    const row = document.createElement('tr');
    setDataset(row, {
      sortModel: price.modelId || '',
      sortGroup: price.groupName || '',
      sortSequence: index + 1,
      sortUnit: displayPriceUnit(price.unit || '', price.currency),
      sortInputPrice: priceSortValue(price.inputPrice),
      sortOutputPrice: priceSortValue(price.outputPrice),
      sortCacheInputPrice: priceSortValue(price.cacheInputPrice),
      sortCacheOutputPrice: priceSortValue(price.cacheOutputPrice),
      originalOrder: index,
    });
    const sequenceCell = tableCell(labels.sequence || '', 'center', '', { sequence: true });
    sequenceCell.textContent = String(index + 1);
    row.append(sequenceCell);

    const modelCell = tableCell(labels.model || '', 'left', 'min-w-48');
    const modelLink = el('a', 'data-row-model-name break-words font-mono text-xs font-semibold', price.modelId || '');
    modelLink.dataset.rowPrimary = '';
    modelLink.href = gatewayModelPath(price.modelId || '', modelLinkPrefix);
    modelLink.dataset.umamiEvent = 'internal-link-click';
    modelLink.dataset.umamiEventLinkType = 'gateway-model';
    modelLink.dataset.umamiEventName = price.modelId || '';
    modelLink.dataset.umamiEventTargetPage = modelLink.href;
    modelLink.dataset.umamiEventUrl = modelLink.href;
    modelCell.append(modelLink);
    row.append(modelCell);
    row.append(groupCell(price));
    row.append(tableCell(labels.unit || '', 'left', 'data-price-unit', {}).appendChild(document.createTextNode(displayPriceUnit(price.unit || '', price.currency))).parentElement);
    row.append(tableCell(labels.inputPrice || '', 'right', 'font-mono').appendChild(document.createTextNode(formatPrice(price.inputPrice))).parentElement);
    row.append(tableCell(labels.outputPrice || '', 'right', 'font-mono').appendChild(document.createTextNode(formatPrice(price.outputPrice))).parentElement);
    row.append(tableCell(labels.cacheInputPrice || '', 'right', 'font-mono').appendChild(document.createTextNode(formatPrice(price.cacheInputPrice))).parentElement);
    row.append(tableCell(labels.cacheOutputPrice || '', 'right', 'font-mono').appendChild(document.createTextNode(formatPrice(price.cacheOutputPrice))).parentElement);
    return row;
  }

  function priceStackCell(label, values, mapValue) {
    const cell = tableCell(label, label === (config.labels?.unit || '') ? 'left' : 'right', label === (config.labels?.unit || '') ? 'data-price-unit' : 'font-mono');
    const wrap = el('div', 'space-y-1');
    if (values.length) values.forEach(value => wrap.append(el('div', '', mapValue(value))));
    else wrap.append(el('span', 'text-base-content/35', '-'));
    cell.append(wrap);
    return cell;
  }

  function modelSiteRowElement(site, index) {
    const labels = config.labels || {};
    const prices = Array.isArray(site.pricesForModel) ? site.pricesForModel : [];
    const detailHref = `${gatewayLinkPrefix}/${site.slug}`;
    const row = document.createElement('tr');
    setDataset(row, {
      gatewaySiteKey: site.slug,
      sortSticky: site.sponsor ? 1 : 0,
      sortSupport: Number(site.supportPoints) || 0,
      sortSequence: index + 1,
      sortName: site.name || '',
      sortScore: site.siteScore ?? '',
      sortGroup: prices[0]?.groupName || '',
      sortUnit: prices.map(price => displayPriceUnit(price.unit || '', price.currency)).join(' '),
      sortInputPrice: firstFinite(prices.map(price => price.inputPrice)),
      sortOutputPrice: firstFinite(prices.map(price => price.outputPrice)),
      sortCacheInputPrice: firstFinite(prices.map(price => price.cacheInputPrice)),
      sortCacheOutputPrice: firstFinite(prices.map(price => price.cacheOutputPrice)),
      originalOrder: index,
    });

    const sequenceCell = tableCell(labels.sequence || '', 'center', '', { sequence: true });
    sequenceCell.textContent = String(index + 1);
    row.append(sequenceCell);

    const infoCell = tableCell(labels.basicInfo || '');
    const infoWrap = el('div', 'data-entity-cell');
    const contentWrap = el('div', 'data-entity-content');
    const textWrap = el('div', 'data-entity-copy');
    const titleWrap = el('div', 'flex flex-wrap items-center gap-2');
    const siteLink = el('a', 'merchant-link', site.name || '');
    siteLink.dataset.rowPrimary = '';
    siteLink.href = detailHref;
    siteLink.dataset.umamiEvent = 'internal-link-click';
    siteLink.dataset.umamiEventLinkType = 'gateway-site';
    siteLink.dataset.umamiEventName = site.name || '';
    siteLink.dataset.umamiEventTargetPage = detailHref;
    siteLink.dataset.umamiEventUrl = detailHref;
    infoWrap.append(favorites.create(site.slug, site.name));
    titleWrap.append(siteLink);
    if (site.sponsor) titleWrap.append(window.CardNavMerchantBadge.create(config.sponsorLabel || 'Partner', config.sponsorDescription || '', partnershipUrl, config.partnershipLinkLabel || 'How to partner'));
    if (Number(site.supportPoints) > 0) titleWrap.appendChild(window.CardNavMerchantBadge.create(config.supportLabel, config.supportDescription, config.supportersUrl, config.supportLinkLabel, 'support'));

    textWrap.append(titleWrap);
    if (site.summary) textWrap.append(el('p', 'data-entity-description', site.summary));
    const urlWrap = el('div', 'text-xs text-base-content/55');
    urlWrap.append(el('span', 'break-all', site.url || ''));
    textWrap.append(urlWrap);
    const actionWrap = el('div', 'data-entity-actions');
    const detailLink = el('a', 'data-entity-action', config.detailLabel || '');
    detailLink.href = detailHref;
    detailLink.dataset.umamiEvent = 'internal-link-click';
    detailLink.dataset.umamiEventLinkType = 'gateway-site';
    detailLink.dataset.umamiEventName = site.name || '';
    detailLink.dataset.umamiEventTargetPage = detailHref;
    detailLink.dataset.umamiEventUrl = detailHref;
    const openLink = el('a', 'data-entity-action', config.openLabel || '');
    openLink.href = site.outboundUrl || site.url || '';
    openLink.target = '_blank';
    const externalIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    externalIcon.setAttribute('class', 'gateway-external-icon');
    externalIcon.setAttribute('viewBox', '0 0 24 24');
    externalIcon.setAttribute('fill', 'none'); externalIcon.setAttribute('stroke', 'currentColor');
    externalIcon.setAttribute('stroke-width', '1.8'); externalIcon.setAttribute('aria-hidden', 'true');
    const externalPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    externalPath.setAttribute('d', 'M14 3h7v7M21 3l-10 10M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5');
    externalIcon.append(externalPath); openLink.append(externalIcon);
    openLink.rel = site.sponsor || Number(site.supportPoints) > 0 ? 'noopener noreferrer sponsored' : 'noopener noreferrer';
    openLink.dataset.umamiEvent = 'external-link-click';
    openLink.dataset.umamiEventLinkType = 'gateway-site-open';
    openLink.dataset.umamiEventName = site.name || '';
    openLink.dataset.umamiEventUrl = site.outboundUrl || site.url || '';
    actionWrap.append(detailLink, openLink);
    contentWrap.append(textWrap, actionWrap);
    infoWrap.append(contentWrap);
    infoCell.append(infoWrap);
    row.append(infoCell);
    if (Number(site.supportPoints) > 0) {
      const support = el('div', 'data-support-inline', `${config.supportTotalLabel} `);
      support.append(el('strong', '', Number(site.supportPoints).toLocaleString(undefined, { maximumFractionDigits: 2 })));
      textWrap.append(support);
    }
    const scoreCell = tableCell(labels.score || '', 'right', 'font-mono');
    scoreCell.append(createScoreDisplay(site.siteScore));
    row.append(scoreCell);
    row.append(groupCell(prices[0]));
    row.append(priceStackCell(labels.unit || '', prices, price => displayPriceUnit(price.unit || '', price.currency)));
    row.append(priceStackCell(labels.inputPrice || '', prices, price => formatPrice(price.inputPrice)));
    row.append(priceStackCell(labels.outputPrice || '', prices, price => formatPrice(price.outputPrice)));
    row.append(priceStackCell(labels.cacheInputPrice || '', prices, price => formatPrice(price.cacheInputPrice)));
    row.append(priceStackCell(labels.cacheOutputPrice || '', prices, price => formatPrice(price.cacheOutputPrice)));
    return row;
  }

  const searchInput = root.querySelector('[data-gateway-detail-search]');
  const unitSelect = root.querySelector('[data-quote-unit]');
  const groupSelect = root.querySelector('[data-quote-group]');
  const minScoreSelect = root.querySelector('[data-quote-min-score]');
  const items = config.items || [];
  let sort = null;
  let visibleLimit = Number(config.pageSize) || 100;

  function compare(left, right, key, direction = 'asc') {
    if (priceMetrics.includes(key)) {
      const unitOrder = comparePriceUnits(left.price, right.price);
      if (unitOrder) return unitOrder;
    }
    const a = priceMetrics.includes(key) ? left.price[key] : left[key];
    const b = priceMetrics.includes(key) ? right.price[key] : right[key];
    const missingA = a === null || a === undefined || (typeof a === 'number' && !Number.isFinite(a));
    const missingB = b === null || b === undefined || (typeof b === 'number' && !Number.isFinite(b));
    if (missingA !== missingB) return missingA ? 1 : -1;
    const result = typeof a === 'number' && typeof b === 'number' ? a - b : String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true });
    return result * (direction === 'desc' ? -1 : 1) || left.index - right.index;
  }

  function render() {
    const unit = unitSelect?.value || '';
    renderFilterSummary(root.querySelector('[data-quote-filter-summary]'), [unitSelect, groupSelect, minScoreSelect].filter(Boolean).map(input => ({ input, label: () => input.selectedOptions[0]?.textContent || '' })), {
      clearLabel: config.clearFilters,
      countElement: root.querySelector('[data-filter-count]'),
      onChange: resetAndRender,
    });
    const query = (searchInput?.value || '').trim().toLowerCase();
    let entries;
    if (tableType === 'modelSites') {
      entries = selectModelSiteQuotes(items, {
        query, unit, minScore: minScoreSelect?.value ? Number(minScoreSelect.value) : undefined,
        compare: sort ? (a, b) => compare(a, b, sort.key, sort.direction) : undefined,
        unitLabel: price => displayPriceUnit(price.unit, price.currency),
      });
    } else {
      entries = items.filter(price => matchesPriceUnit(price, unit) && (!query || price.modelId.toLowerCase().includes(query)) && (!groupSelect || !groupSelect.value || price.groupId === JSON.parse(groupSelect.value))).map((price, index) => ({ price, index, group: price.groupName, model: price.modelId, unit: displayPriceUnit(price.unit, price.currency) }));
    }
    if (sort && tableType !== 'modelSites') entries.sort((a, b) => compare(a, b, sort.key, sort.direction));
    const rows = [];
    entries.slice(0, visibleLimit).forEach((entry, index) => {
      const row = tableType === 'modelSites' ? modelSiteRowElement({ ...entry.site, pricesForModel: [entry.price] }, index) : priceRowElement(entry.price, index);
      if (tableType === 'modelSites') row.dataset.pinKind = entry.pinKind;
      setTableRowSequence(row, index + 1);
      rows.push(row);
    });
    tbody.replaceChildren(...rows);
    favorites.sync(root);
    if (summary) summary.textContent = config.displaySummary.replace('{rendered}', String(Math.min(visibleLimit, entries.length))).replace('{total}', String(entries.length));
    button?.classList.toggle('hidden', visibleLimit >= entries.length);
    const emptyState = root.querySelector('.data-table-empty-state');
    if (emptyState) {
      emptyState.classList.toggle('hidden', entries.length > 0);
      emptyState.textContent = query || unit || groupSelect?.value || minScoreSelect?.value ? config.filterEmpty : config.noPriceData;
    }
    window.updateDataTableHeaders?.(table, sort || (tableType === 'modelSites' ? { key: 'score', direction: 'desc', type: 'number' } : null));

  }

  function readFilterQuery() {
    const params = new URLSearchParams(window.location.search);
    if (searchInput) searchInput.value = params.get(tableType === 'prices' ? 'model' : 'q') || '';
    if (unitSelect) {
      const unit = params.get('unit');
      unitSelect.value = [...unitSelect.options].some(option => option.value === unit) ? unit : '';
    }
    if (minScoreSelect) {
      const score = params.get('minScore');
      minScoreSelect.value = [...minScoreSelect.options].some(option => option.value === score) ? score : '';
    }
    if (groupSelect) {
      const group = params.has('group') ? JSON.stringify(params.get('group')) : '';
      groupSelect.value = [...groupSelect.options].some(option => option.value === group) ? group : '';
    }
  }

  function writeFilterQuery(replace = false) {
    const url = new URL(window.location.href);
    const searchKey = tableType === 'prices' ? 'model' : 'q';
    const query = (searchInput?.value || '').trim();
    if (query) url.searchParams.set(searchKey, query); else url.searchParams.delete(searchKey);
    if (unitSelect?.value) url.searchParams.set('unit', unitSelect.value); else url.searchParams.delete('unit');
    if (minScoreSelect?.value) url.searchParams.set('minScore', minScoreSelect.value); else if (minScoreSelect) url.searchParams.delete('minScore');
    if (groupSelect?.value) url.searchParams.set('group', JSON.parse(groupSelect.value)); else url.searchParams.delete('group');
    const next = `${url.pathname}${url.search}${url.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history[replace ? 'replaceState' : 'pushState'](null, '', next);
  }

  function resetAndRender() { writeFilterQuery(); visibleLimit = Number(config.pageSize) || 100; render(); }
  root.addEventListener('filter-clear', () => { if (unitSelect) unitSelect.value = ''; if (groupSelect) groupSelect.value = ''; if (minScoreSelect) minScoreSelect.value = ''; resetAndRender(); });
  unitSelect?.addEventListener('change', resetAndRender);
  groupSelect?.addEventListener('change', resetAndRender);
  minScoreSelect?.addEventListener('change', resetAndRender);
  let timer;
  searchInput?.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(resetAndRender, 180); });
  button?.addEventListener('click', () => { visibleLimit += Number(config.pageSize) || 100; render(); });
  table.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest('[data-inline-help]')) return;
    const control = target.closest('.data-table-sort-button');
    if (!control) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const key = control.dataset.sortKey;
    if (!key) return;
    const direction = sort?.key === key ? (sort.direction === 'asc' ? 'desc' : null) : 'asc';
    sort = direction ? { key, direction, type: control.dataset.sortType } : null;
    resetAndRender();
    window.CardNavTelemetry?.track('sort-change', { scope: tableType, key, direction: direction || 'none' }, root);
  }, { capture: true });
  window.addEventListener('popstate', () => { clearTimeout(timer); readFilterQuery(); visibleLimit = Number(config.pageSize) || 100; render(); });
  readFilterQuery();
  writeFilterQuery(true);
  render();
})();
