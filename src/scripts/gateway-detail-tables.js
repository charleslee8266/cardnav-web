/*
 * 文件说明: 接管中转站详情类表格的远端补齐、渐进 DOM 渲染和全量本地排序。
 */

(() => {
  const root = document.querySelector('[data-gateway-deferred-table]');
  if (!root) return;

  const config = JSON.parse(document.getElementById('gateway-deferred-table-config')?.textContent || '{}');
  const table = root.querySelector('[data-table]');
  const tbody = table?.querySelector('tbody');
  const button = root.querySelector('[data-gateway-detail-load-more]');
  const summary = root.querySelector('[data-table-summary]');
  if (!(table instanceof HTMLElement) || !tbody) return;
  if (typeof window.createDeferredTableController !== 'function') return;
  const tableType = config.type || root.dataset.gatewayDeferredTable || '';

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

  function displayPriceUnit(unit) {
    if (unit === '1M_tokens' || unit === 'quota_ratio') return '$ / 1M tokens';
    if (unit === 'call') return 'per call';
    return unit || '-';
  }

  function firstFinite(values) {
    const value = values.find(item => typeof item === 'number' && Number.isFinite(item));
    return typeof value === 'number' ? value : '';
  }

  function numericSortValue(value) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : Number.NEGATIVE_INFINITY;
  }

  function rowSortValue(row, key, type) {
    const value = row.dataset[`sort${key.charAt(0).toUpperCase()}${key.slice(1)}`] ?? '';
    if (type === 'number') {
      const numberValue = Number(value);
      return Number.isFinite(numberValue) ? numberValue : Number.NEGATIVE_INFINITY;
    }
    return value;
  }

  function priceEntryFromRow(row, index) {
    return {
      index,
      row,
      item: null,
      sort: {
        sequence: rowSortValue(row, 'sequence', 'number') || index + 1,
        model: rowSortValue(row, 'model'),
        unit: rowSortValue(row, 'unit'),
        inputPrice: rowSortValue(row, 'inputPrice', 'number'),
        outputPrice: rowSortValue(row, 'outputPrice', 'number'),
        cacheInputPrice: rowSortValue(row, 'cacheInputPrice', 'number'),
        cacheOutputPrice: rowSortValue(row, 'cacheOutputPrice', 'number'),
      },
    };
  }

  function modelSiteEntryFromRow(row, index) {
    return {
      index,
      row,
      item: null,
      sort: {
        sticky: rowSortValue(row, 'sticky', 'number'),
        sequence: rowSortValue(row, 'sequence', 'number') || index + 1,
        name: rowSortValue(row, 'name'),
        unit: rowSortValue(row, 'unit'),
        inputPrice: rowSortValue(row, 'inputPrice', 'number'),
        outputPrice: rowSortValue(row, 'outputPrice', 'number'),
        cacheInputPrice: rowSortValue(row, 'cacheInputPrice', 'number'),
        cacheOutputPrice: rowSortValue(row, 'cacheOutputPrice', 'number'),
      },
    };
  }

  function priceEntryFromItem(item, index) {
    return {
      index,
      row: null,
      item,
      sort: {
        sequence: index + 1,
        model: item.modelId || '',
        unit: displayPriceUnit(item.unit || ''),
        inputPrice: numericSortValue(priceSortValue(item.inputPrice)),
        outputPrice: numericSortValue(priceSortValue(item.outputPrice)),
        cacheInputPrice: numericSortValue(priceSortValue(item.cacheInputPrice)),
        cacheOutputPrice: numericSortValue(priceSortValue(item.cacheOutputPrice)),
      },
    };
  }

  function modelSiteEntryFromItem(site, index) {
    const prices = Array.isArray(site.pricesForModel) ? site.pricesForModel : [];
    return {
      index,
      row: null,
      item: site,
      sort: {
        sticky: site.sponsor ? 1 : 0,
        sequence: index + 1,
        name: site.name || '',
        unit: prices.map(price => displayPriceUnit(price.unit || '')).join(' '),
        inputPrice: numericSortValue(firstFinite(prices.map(price => price.inputPrice))),
        outputPrice: numericSortValue(firstFinite(prices.map(price => price.outputPrice))),
        cacheInputPrice: numericSortValue(firstFinite(prices.map(price => price.cacheInputPrice))),
        cacheOutputPrice: numericSortValue(firstFinite(prices.map(price => price.cacheOutputPrice))),
      },
    };
  }

  function priceRowElement(price, index) {
    const labels = config.labels || {};
    const row = document.createElement('tr');
    setDataset(row, {
      sortModel: price.modelId || '',
      sortSequence: index + 1,
      sortUnit: displayPriceUnit(price.unit || ''),
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
    const modelLink = el('a', 'link link-hover break-words font-mono text-xs font-semibold text-primary', price.modelId || '');
    modelLink.href = `${config.modelLinkPrefix || '/llm-gateway/models'}/${encodeURIComponent(price.modelId || '')}`;
    modelLink.dataset.umamiEvent = 'gateway-model-click';
    modelLink.dataset.umamiEventName = price.modelId || '';
    modelLink.dataset.umamiEventTargetPage = modelLink.href;
    modelLink.dataset.umamiEventUrl = modelLink.href;
    modelCell.append(modelLink);
    row.append(modelCell);
    row.append(tableCell(labels.unit || '', 'left', '', {}).appendChild(document.createTextNode(displayPriceUnit(price.unit || ''))).parentElement);
    row.append(tableCell(labels.inputPrice || '', 'right', 'font-mono').appendChild(document.createTextNode(formatPrice(price.inputPrice))).parentElement);
    row.append(tableCell(labels.outputPrice || '', 'right', 'font-mono').appendChild(document.createTextNode(formatPrice(price.outputPrice))).parentElement);
    row.append(tableCell(labels.cacheInputPrice || '', 'right', 'font-mono').appendChild(document.createTextNode(formatPrice(price.cacheInputPrice))).parentElement);
    row.append(tableCell(labels.cacheOutputPrice || '', 'right', 'font-mono').appendChild(document.createTextNode(formatPrice(price.cacheOutputPrice))).parentElement);
    return row;
  }

  function priceStackCell(label, values, mapValue) {
    const cell = tableCell(label, label === (config.labels?.unit || '') ? 'left' : 'right', label === (config.labels?.unit || '') ? '' : 'font-mono');
    const wrap = el('div', 'space-y-1');
    if (values.length) values.forEach(value => wrap.append(el('div', '', mapValue(value))));
    else wrap.append(el('span', 'text-base-content/35', '-'));
    cell.append(wrap);
    return cell;
  }

  function modelSiteRowElement(site, index) {
    const labels = config.labels || {};
    const prices = Array.isArray(site.pricesForModel) ? site.pricesForModel : [];
    const detailHref = `${config.gatewayLinkPrefix || '/llm-gateway'}/${site.slug}`;
    const row = document.createElement('tr');
    setDataset(row, {
      sortSticky: site.sponsor ? 1 : 0,
      sortSequence: index + 1,
      sortName: site.name || '',
      sortUnit: prices.map(price => displayPriceUnit(price.unit || '')).join(' '),
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
    const infoWrap = el('div', 'flex flex-col gap-3 sm:flex-row sm:items-stretch sm:justify-between');
    const textWrap = el('div', 'min-w-0 space-y-2');
    const titleWrap = el('div', 'flex flex-wrap items-center gap-2');
    const siteLink = el('a', 'link link-hover break-words text-base font-semibold text-primary', site.name || '');
    siteLink.href = detailHref;
    siteLink.dataset.umamiEvent = 'gateway-site-click';
    siteLink.dataset.umamiEventName = site.name || '';
    siteLink.dataset.umamiEventTargetPage = detailHref;
    siteLink.dataset.umamiEventUrl = detailHref;
    titleWrap.append(siteLink);
    if (site.sponsor) titleWrap.append(el('span', 'gateway-sponsor-badge', config.sponsorLabel || 'Sponsored'));
    if (site.displayFamily) titleWrap.append(el('span', 'badge badge-ghost font-medium', site.displayFamily));
    textWrap.append(titleWrap);
    if (site.summary) textWrap.append(el('p', 'max-w-3xl text-sm leading-6 text-base-content/72', site.summary));
    const urlWrap = el('div', 'text-xs text-base-content/55');
    urlWrap.append(el('span', 'break-all', site.url || ''));
    textWrap.append(urlWrap);
    const actionWrap = el('div', 'inline-flex shrink-0 items-center gap-2 self-start sm:self-center');
    const detailLink = el('a', 'btn btn-primary btn-xs inline-flex h-7 min-h-7 items-center px-3 leading-none', config.detailLabel || '');
    detailLink.href = detailHref;
    detailLink.dataset.umamiEvent = 'gateway-site-click';
    detailLink.dataset.umamiEventName = site.name || '';
    detailLink.dataset.umamiEventTargetPage = detailHref;
    detailLink.dataset.umamiEventUrl = detailHref;
    const openLink = el('a', 'btn btn-outline btn-xs inline-flex h-7 min-h-7 items-center px-3 leading-none', config.openLabel || '');
    openLink.href = site.outboundUrl || site.url || '';
    openLink.target = '_blank';
    openLink.rel = 'noopener noreferrer';
    openLink.dataset.umamiEvent = 'gateway-site-open-click';
    openLink.dataset.umamiEventName = site.name || '';
    openLink.dataset.umamiEventUrl = site.outboundUrl || site.url || '';
    actionWrap.append(detailLink, openLink);
    infoWrap.append(textWrap, actionWrap);
    infoCell.append(infoWrap);
    row.append(infoCell);
    row.append(priceStackCell(labels.unit || '', prices, price => displayPriceUnit(price.unit || '')));
    row.append(priceStackCell(labels.inputPrice || '', prices, price => formatPrice(price.inputPrice)));
    row.append(priceStackCell(labels.outputPrice || '', prices, price => formatPrice(price.outputPrice)));
    row.append(priceStackCell(labels.cacheInputPrice || '', prices, price => formatPrice(price.cacheInputPrice)));
    row.append(priceStackCell(labels.cacheOutputPrice || '', prices, price => formatPrice(price.cacheOutputPrice)));
    return row;
  }

  function ensureRow(entry) {
    if (!entry.row) {
      entry.row = tableType === 'modelSites'
        ? modelSiteRowElement(entry.item, entry.index)
        : priceRowElement(entry.item, entry.index);
    }
    entry.row.classList.remove('hidden');
    return entry.row;
  }

  const controller = window.createDeferredTableController({
    table,
    tbody,
    button,
    summary,
    pageSize: Number(config.pageSize) || 100,
    totalCount: Number(config.totalCount) || 0,
    apiUrl: config.apiUrl || '',
    summaryTemplate: config.displaySummary || 'Showing {rendered} / {total}',
    entryFromRow: (row, index) => (
      tableType === 'modelSites' ? modelSiteEntryFromRow(row, index) : priceEntryFromRow(row, index)
    ),
    entryFromItem: (item, index) => (
      tableType === 'modelSites' ? modelSiteEntryFromItem(item, index) : priceEntryFromItem(item, index)
    ),
    ensureRow,
  });

  async function handleSort(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('[data-inline-help]')) return;
    const sortButton = target.closest('.data-table-sort-button') || target.closest('.data-table-head-cell-sortable')?.querySelector('.data-table-sort-button');
    if (!(sortButton instanceof HTMLElement)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    await controller.sortFromButton(sortButton);
  }

  controller.initialize();

  button?.addEventListener('click', async () => {
    try {
      await controller.loadMore();
    } catch {
      button?.removeAttribute('disabled');
    }
  });
  table.addEventListener('click', handleSort, { capture: true });
})();
