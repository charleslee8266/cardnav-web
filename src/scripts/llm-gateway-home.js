import { createScoreDisplay, createProviderLabel } from '../data-display.js';
import { renderFilterSummary } from './filter-summary.js';
import { gatewayProviderSlug } from '../shop-plan-search.js';
import { setTableRowSequence } from './table-sequence.js';
/*
 * 文件说明: 中转站首页标签页、本地筛选、URL 查询参数同步、懒加载与排序埋点交互。
 */
import { pinSiteRows } from '../site-list-pinning.js';
import { GatewayFavorites } from './GatewayFavorites.js';
import { formatPositiveScore, paymentIcon, uniqueLabels } from '../gateway-display.js';

(() => {
  const gatewayHome = document.querySelector('[data-gateway-home]');
  if (!gatewayHome) return;

  const config = JSON.parse(document.getElementById('gateway-home-config')?.textContent || '{}');
  const favorites = new GatewayFavorites(gatewayHome, { favorite: config.favoriteLabel, unfavorite: config.unfavoriteLabel }, () => {
    void applySharedFiltersWithDeferred({ track: false });
  });
  function localizedFallbackPath(pathname) {
    const normalizedPathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
    const [, maybeLocale] = window.location.pathname.split('/');
    return ['en', 'ru'].includes(maybeLocale) ? `/${maybeLocale}${normalizedPathname}` : normalizedPathname;
  }

  const gatewayLinkPrefix = config.gatewayLinkPrefix || localizedFallbackPath('/llm-gateway');
  const modelLinkPrefix = config.modelLinkPrefix || localizedFallbackPath('/llm-gateway/models');
  const partnershipUrl = config.partnershipUrl || localizedFallbackPath('/partnership');
  const paymentMethodLabels = config.paymentMethodLabels || {};
  const siteSearchInput = gatewayHome.querySelector('[data-home-site-search]');
  const siteFamilySelect = gatewayHome.querySelector('[data-home-site-family]');
  const sitePaymentSelect = gatewayHome.querySelector('[data-home-site-payment]');
  const siteStatusSelect = gatewayHome.querySelector('[data-home-site-status]');
  const siteFavoritesInput = gatewayHome.querySelector('[data-home-site-favorites]');
  const siteSortSelect = gatewayHome.querySelector('[data-home-site-sort]');
  const modelSearchInput = gatewayHome.querySelector('[data-home-model-search]');
  const SITE_PAGE_SIZE = Number(config.sitePageSize) || 50;
  const MODEL_PAGE_SIZE = Number(config.modelPageSize) || 100;
  const gatewayLists = {
    sites: {
      type: 'sites',
      listSelector: '[data-gateway-home-sites-list]',
      rowSelector: '[data-home-site-card]',
      emptySelector: '[data-home-site-empty]',
      apiUrl: config.sitesApi,
      loaded: !gatewayHome.querySelector('[data-gateway-load-more="sites"]'),
      promise: null,
      pageSize: SITE_PAGE_SIZE,
      visibleLimit: SITE_PAGE_SIZE,
      totalCount: Number(config.siteTotalCount) || 0,
      entries: [],
      filteredEntries: [],
      sort: null,
    },
    models: {
      type: 'models',
      listSelector: '[data-gateway-home-models-list]',
      rowSelector: '[data-home-model-card]',
      emptySelector: '[data-home-model-empty]',
      apiUrl: config.modelsApi,
      loaded: !gatewayHome.querySelector('[data-gateway-load-more="models"]'),
      promise: null,
      pageSize: MODEL_PAGE_SIZE,
      visibleLimit: MODEL_PAGE_SIZE,
      totalCount: Number(config.modelTotalCount) || 0,
      entries: [],
      filteredEntries: [],
      sort: null,
    },
  };
  let gatewayFilterTrackTimer = null;
  let lastGatewayFilterTrackKey = '';

  function trackGatewayEvent(eventName, eventData = {}) {
    const panel = gatewayHome.querySelector(`[data-gateway-panel="${eventData.tab}"]`);
    window.CardNavTelemetry?.track(eventName, eventData, panel);
  }

  function paymentLabel(key) {
    return paymentMethodLabels[key] || key;
  }

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

  function setTracking(node, attrs) {
    Object.entries(attrs).forEach(([key, value]) => {
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

  function gatewaySiteTracking(site) {
    const targetPage = `${gatewayLinkPrefix}/${site.slug}`;
    return {
      umamiEvent: 'internal-link-click',
      umamiEventLinkType: 'gateway-site',
      umamiEventName: site.name,
      umamiEventTargetPage: targetPage,
      umamiEventUrl: targetPage,
    };
  }

  function gatewaySiteOpenTracking(site) {
    return {
      umamiEvent: 'external-link-click',
      umamiEventLinkType: 'gateway-site-open',
      umamiEventName: site.name,
      umamiEventUrl: site.outboundUrl || site.url,
    };
  }

  function gatewayModelTracking(model) {
    const targetPage = `${modelLinkPrefix}/${encodeURIComponent(model.modelId)}`;
    return {
      umamiEvent: 'internal-link-click',
      umamiEventLinkType: 'gateway-model',
      umamiEventName: model.modelId,
      umamiEventFamily: model.modelProvider,
      umamiEventTargetPage: targetPage,
      umamiEventUrl: targetPage,
    };
  }

  function isStickySite(site) {
    return Boolean(site.sponsor);
  }

  function paymentBadges(payments) {
    const wrap = el('div', 'flex flex-wrap gap-1.5');
    payments.forEach(item => {
      const icon = paymentIcon(item);
      const label = paymentLabel(item);
      const badge = el('span', 'payment-icon', icon.src ? undefined : icon.fallback);
      badge.title = label;
      badge.setAttribute('aria-label', label);
      if (icon.src) {
        const image = document.createElement('img');
        image.src = icon.src;
        image.alt = '';
        image.loading = 'lazy';
        badge.append(image);
      }
      wrap.append(badge);
    });
    return wrap;
  }

  function siteRowElement(site, index) {
    const families = uniqueLabels(site.displayModelProviders, 8);
    const payments = uniqueLabels(site.paymentMethods, 6);
    const search = `${site.name} ${site.url} ${site.host} ${(site.displayModelProviders || []).join(' ')} ${(site.paymentMethods || []).map(paymentLabel).join(' ')}`.toLowerCase();
    const row = document.createElement('tr');
    row.setAttribute('data-home-site-card', '');
    setDataset(row, {
      search,
      families: families.map(gatewayProviderSlug).join(','),
      payments: payments.join(','),
      priceCount: Number(site.priceCount) || 0,
      originalOrder: index,
      sortSequence: index + 1,
      sortSticky: isStickySite(site) ? 1 : 0,
      sortSupport: Number(site.supportPoints) || 0,
      sortName: site.name,
      sortScore: Number(site.siteScore) || 0,
      sortFamilies: families.join(' '),
      sortModelCount: Number(site.modelCount) || 0,
      sortPayments: payments.map(paymentLabel).join(' '),
    });

    const sequenceCell = tableCell(config.sequenceLabel, 'center', '', { sequence: true });
    sequenceCell.textContent = String(index + 1);
    row.dataset.gatewaySiteKey = site.slug;
    row.append(sequenceCell);

    const infoCell = tableCell(config.basicInfoLabel);
    const infoWrap = el('div', 'data-entity-cell');
    const textWrap = el('div', 'data-entity-copy');
    const titleWrap = el('div', 'merchant-header');
    const siteLink = el('a', 'merchant-link', site.name);
    siteLink.dataset.rowPrimary = '';
    siteLink.href = `${gatewayLinkPrefix}/${site.slug}`;
    setTracking(siteLink, gatewaySiteTracking(site));
    textWrap.append(favorites.create(site.slug, site.name));
    const titleContent = el('div', 'merchant-header-content');
    const titleRow = el('div', 'merchant-title-row');
    titleRow.append(siteLink);
    titleContent.append(titleRow);
    const tagRow = el('div', 'merchant-tag-row');
    if (site.sponsor) tagRow.append(window.CardNavMerchantBadge.create(config.sponsorLabel || 'Partner', config.sponsorDescription || '', partnershipUrl, config.partnershipLinkLabel || 'How to partner'));
    if (Number(site.supportPoints) > 0) tagRow.append(window.CardNavMerchantBadge.create(config.supportLabel, config.supportDescription, config.supportersUrl, config.supportLinkLabel, 'support'));
    if (tagRow.childElementCount > 0) titleRow.append(...tagRow.childNodes);
    titleWrap.append(titleContent);

    textWrap.append(titleWrap);
    if (site.summary) textWrap.append(el('p', 'data-entity-description', site.summary));
    const urlWrap = el('div', 'text-xs text-base-content/55');
    urlWrap.append(el('span', 'break-all', site.url));
    textWrap.append(urlWrap);
    if (site.priceCount === 0) textWrap.append(el('p', 'text-xs text-base-content/45', site.modelCount ? config.dataStatusLabels.noPrice : config.dataStatusLabels.noData));
    const actionWrap = el('div', 'data-entity-actions');
    const detailLink = el('a', 'data-entity-action', config.detailLabel);
    detailLink.href = `${gatewayLinkPrefix}/${site.slug}`;
    setTracking(detailLink, gatewaySiteTracking(site));
    const openLink = el('a', 'data-entity-action', config.openLabel);
    openLink.href = site.outboundUrl || site.url;
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
    setTracking(openLink, gatewaySiteOpenTracking(site));
    actionWrap.append(detailLink, openLink);
    infoWrap.append(textWrap, actionWrap);
    infoCell.append(infoWrap);
    row.append(infoCell);
    if (Number(site.supportPoints) > 0) {
      const support = el('div', 'data-support-inline', `${config.supportTotalLabel} `);
      support.append(el('strong', '', Number(site.supportPoints).toLocaleString(undefined, { maximumFractionDigits: 2 })));
      textWrap.append(support);
    }
    const scoreCell = tableCell(config.scoreLabel, 'right', 'font-mono');
    scoreCell.append(createScoreDisplay(site.siteScore));
    row.append(scoreCell);

    const familiesCell = tableCell(config.supportedModelsLabel);
    if (families.length) {
      const wrap = el('div', 'flex flex-wrap gap-1.5');
      families.forEach(family => wrap.append(createProviderLabel(family)));
      familiesCell.append(wrap);
    } else {
      familiesCell.append(el('span', 'text-base-content/35', '-'));
    }
    row.append(familiesCell);

    const modelCountCell = tableCell(config.modelCountLabel, 'right', 'font-mono');
    modelCountCell.textContent = site.modelCount > 0 ? site.modelCount : '-';
    row.append(modelCountCell);

    const paymentsCell = tableCell(config.paymentMethodsLabel);
    paymentsCell.append(payments.length ? paymentBadges(payments) : el('span', 'text-base-content/35', '-'));
    row.append(paymentsCell);
    return row;
  }

  function modelRowElement(model, index) {
    const row = document.createElement('tr');
    row.setAttribute('data-home-model-card', '');
    setDataset(row, {
      search: `${model.modelId} ${model.modelProvider}`.toLowerCase(),
      originalOrder: index,
      sortSequence: index + 1,
      sortModel: model.modelId,
      sortFamily: model.modelProvider,
      sortSupportCount: Number(model.supportSiteCount) || 0,
    });
    const sequenceCell = tableCell(config.sequenceLabel, 'center', '', { sequence: true });
    sequenceCell.textContent = String(index + 1);
    row.append(sequenceCell);
    const modelCell = tableCell(config.modelLabel);
    const modelLink = el('a', 'link link-hover break-words font-mono text-sm font-semibold text-primary', model.modelId);
    modelLink.dataset.rowPrimary = '';
    modelLink.href = `${modelLinkPrefix}/${encodeURIComponent(model.modelId)}`;
    setTracking(modelLink, gatewayModelTracking(model));
    modelCell.append(modelLink);
    row.append(modelCell);
    const familyCell = tableCell(config.modelProviderLabel);
    familyCell.append(createProviderLabel(model.modelProvider));
    row.append(familyCell);
    const supportCountCell = tableCell(config.supportedGatewayCountLabel, 'right', 'font-mono');
    supportCountCell.textContent = model.supportSiteCount;
    row.append(supportCountCell);
    return row;
  }

  function scheduleGatewayFilterTrack(tab, payload) {
    clearTimeout(gatewayFilterTrackTimer);
    gatewayFilterTrackTimer = setTimeout(() => {
      const eventData = { tab, ...payload };
      const eventKey = JSON.stringify({ ...eventData, query: (tab === 'sites' ? siteSearchInput : modelSearchInput)?.value.trim() });
      if (eventKey === lastGatewayFilterTrackKey) return;
      lastGatewayFilterTrackKey = eventKey;
      trackGatewayEvent('filter-change', { scope: 'gateway', ...eventData });
    }, 600);
  }

  function rowSortValue(row, key, type) {
    const value = row.dataset[`sort${key.charAt(0).toUpperCase()}${key.slice(1)}`] ?? '';
    if (type === 'number') {
      const numberValue = Number(value);
      return Number.isFinite(numberValue) ? numberValue : Number.NEGATIVE_INFINITY;
    }
    return value;
  }

  function entryFromRow(row, index, type) {
    return {
      index,
      row,
      item: null,
      search: row.dataset.search || '',
      families: row.dataset.families || '',
      payments: row.dataset.payments || '',
      priceCount: Number(row.dataset.priceCount) || 0,
      sort: type === 'sites' ? {
        sticky: rowSortValue(row, 'sticky', 'number'),
        support: rowSortValue(row, 'support', 'number'),
        sequence: rowSortValue(row, 'sequence', 'number') || index + 1,
        name: rowSortValue(row, 'name'),
        score: rowSortValue(row, 'score', 'number'),
        families: rowSortValue(row, 'families'),
        modelCount: rowSortValue(row, 'modelCount', 'number'),
        payments: rowSortValue(row, 'payments'),
      } : {
        sequence: rowSortValue(row, 'sequence', 'number') || index + 1,
        model: rowSortValue(row, 'model'),
        family: rowSortValue(row, 'family'),
        supportCount: rowSortValue(row, 'supportCount', 'number'),
      },
    };
  }

  function siteEntryFromItem(site, index) {
    const families = uniqueLabels(site.displayModelProviders, 8);
    const payments = uniqueLabels(site.paymentMethods, 6);
    const search = `${site.name} ${site.url} ${site.host} ${(site.displayModelProviders || []).join(' ')} ${(site.paymentMethods || []).map(paymentLabel).join(' ')}`.toLowerCase();
    return {
      index,
      row: null,
      item: site,
      search,
      families: families.map(gatewayProviderSlug).join(','),
      payments: payments.join(','),
      priceCount: Number(site.priceCount) || 0,
      sort: {
        sticky: isStickySite(site) ? 1 : 0,
        support: Number(site.supportPoints) || 0,
        sequence: index + 1,
        name: site.name,
        score: Number(site.siteScore) || 0,
        families: families.join(' '),
        modelCount: Number(site.modelCount) || 0,
        payments: payments.map(paymentLabel).join(' '),
      },
    };
  }

  function modelEntryFromItem(model, index) {
    return {
      index,
      row: null,
      item: model,
      search: `${model.modelId} ${model.modelProvider}`.toLowerCase(),
      families: '',
      payments: '',
      sort: {
        sequence: index + 1,
        model: model.modelId,
        family: model.modelProvider,
        supportCount: Number(model.supportSiteCount) || 0,
      },
    };
  }

  function ensureEntryRow(entry, type) {
    if (!entry.row) {
      entry.row = type === 'sites'
        ? siteRowElement(entry.item, entry.index)
        : modelRowElement(entry.item, entry.index);
    }
    favorites.sync(entry.row);
    entry.row.classList.remove('hidden');
    return entry.row;
  }

  function compareEntries(sort) {
    const multiplier = sort.direction === 'asc' ? 1 : -1;
    return (left, right) => {
      const leftValue = left.sort[sort.key];
      const rightValue = right.sort[sort.key];
      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        if (leftValue !== rightValue) return (leftValue - rightValue) * multiplier;
        return left.index - right.index;
      }
      const compared = String(leftValue ?? '').localeCompare(String(rightValue ?? ''), 'zh-Hans-CN', { numeric: true });
      return compared === 0 ? left.index - right.index : compared * multiplier;
    };
  }

  function currentEntries(state) {
    const entries = state.filteredEntries.slice();
    if (state.type === 'sites') entries.forEach(entry => {
      entry.sort.favorite = favorites.has(entry.item?.slug || entry.row?.dataset.gatewaySiteKey || '') ? 1 : 0;
    });
    entries.sort(compareEntries(state.sort || { key: 'sequence', direction: 'asc' }));
    return pinSiteRows(entries.map(entry => ({ entry, sponsor: Number(entry.sort.sticky) > 0, supportTotalCents: 0, supportPoints: Number(entry.sort.support) || 0, favorite: Number(entry.sort.favorite) > 0 })), (row, kind) => { row.entry.pinKind = kind; }).map(row => row.entry);
  }

  function loadMoreWrap(type) {
    return gatewayHome.querySelector(`[data-gateway-load-more="${type}"]`)?.closest('[data-table-load-more]') || null;
  }

  function loadingLabel(type) {
    return gatewayHome.querySelector(`[data-gateway-loading="${type}"]`);
  }

  function summaryLabel(type) {
    return gatewayHome.querySelector(`[data-gateway-load-summary="${type}"]`);
  }

  function displaySummaryText(renderedCount, totalCount) {
    return (config.displaySummary || 'Showing {rendered} / {total}')
      .replace('{rendered}', String(renderedCount))
      .replace('{total}', String(totalCount));
  }

  function setLoading(type, loading) {
    loadingLabel(type)?.classList.toggle('hidden', !loading);
    summaryLabel(type)?.classList.toggle('hidden', loading);
  }

  function hasActiveFilters(state) {
    return state.type === 'sites' ? hasActiveSiteFilters() : hasActiveModelFilters();
  }

  function updateLoadMoreButton(state) {
    const button = gatewayHome.querySelector(`[data-gateway-load-more="${state.type}"]`);
    const wrap = loadMoreWrap(state.type);
    const summary = summaryLabel(state.type);
    const filtersActive = hasActiveFilters(state);
    const hasMoreRenderedRows = state.filteredEntries.length > state.visibleLimit;
    const canLoadDeferredRows = !state.loaded;
    const renderedCount = Math.min(state.filteredEntries.length, state.visibleLimit);
    const totalCount = filtersActive ? state.filteredEntries.length : Math.max(state.totalCount, state.entries.length);
    const tabCount = gatewayHome.querySelector(`[data-gateway-tab="${state.type}"] .tool-tab-badge`);
    if (tabCount) tabCount.textContent = String(totalCount);
    if (!wrap) return;
    const hasRows = totalCount > 0;
    wrap.classList.toggle('hidden', !hasRows);
    if (summary instanceof HTMLElement) {
      summary.textContent = displaySummaryText(renderedCount, totalCount);
      summary.classList.toggle('hidden', !hasRows || Boolean(state.promise));
    }
    button?.classList.toggle('hidden', !(hasMoreRenderedRows || canLoadDeferredRows));
  }

  function renderGatewayList(state) {
    const list = gatewayHome.querySelector(state.listSelector);
    if (!list) return;
    const entries = currentEntries(state);
    const rows = entries.slice(0, state.visibleLimit).map((entry, index) => {
      const row = ensureEntryRow(entry, state.type);
      row.dataset.pinKind = entry.pinKind || '';
      setTableRowSequence(row, index + 1);
      return row;
    });
    list.replaceChildren(...rows);
    gatewayHome.querySelector(state.emptySelector)?.classList.toggle('hidden', state.filteredEntries.length > 0);
    updateLoadMoreButton(state);
    updateSortButtons(state);
  }

  function filterSiteEntries() {
    const keyword = (siteSearchInput?.value || '').trim().toLowerCase();
    const selectedFamily = siteFamilySelect?.value || '';
    const selectedPayment = sitePaymentSelect?.value || '';
    const state = gatewayLists.sites;
    state.filteredEntries = state.entries.filter(entry => {
      const matchesKeyword = !keyword || entry.search.includes(keyword);
      const matchesFamily = !selectedFamily || entry.families.split(',').includes(selectedFamily);
      const matchesPayment = !selectedPayment || entry.payments.split(',').includes(selectedPayment);
      const status = siteStatusSelect?.value || '';
      const matchesStatus = !status || (status === 'hasPrice' ? entry.priceCount > 0 : status === 'noPrice' ? entry.priceCount === 0 && entry.sort.modelCount > 0 : entry.priceCount === 0 && entry.sort.modelCount === 0);
      const matchesFavorite = !siteFavoritesInput?.checked || favorites.has(entry.item?.slug || entry.row?.dataset.gatewaySiteKey || '');
      return matchesKeyword && matchesFamily && matchesPayment && matchesStatus && matchesFavorite;
    });
    return { keyword, selectedFamily, selectedPayment, visibleCount: state.filteredEntries.length };
  }

  function filterModelEntries() {
    const keyword = (modelSearchInput?.value || '').trim().toLowerCase();
    const state = gatewayLists.models;
    const family = siteFamilySelect?.value || '';
    state.filteredEntries = state.entries.filter(entry => (!keyword || entry.search.includes(keyword)) && (!family || gatewayProviderSlug(entry.sort.family) === family));
    return { keyword, visibleCount: state.filteredEntries.length };
  }

  function applySiteFilters({ track = true } = {}) {
    const { keyword, selectedFamily, selectedPayment, visibleCount } = filterSiteEntries();
    renderGatewayList(gatewayLists.sites);
    renderFilterSummary(gatewayHome.querySelector('[data-home-site-active-filters]'), [siteSearchInput, siteFamilySelect, sitePaymentSelect, siteStatusSelect, siteFavoritesInput].map(input => ({
      input,
      label: () => input === siteFavoritesInput ? input.closest('label').textContent.trim() : input.options ? input.selectedOptions[0].textContent : input.value,
    })), {
      clearLabel: config.clearFilters,
      countElement: gatewayHome.querySelector('[data-filter-count]'),
      onChange: applySiteFilterChange,
    });
    if (track) scheduleGatewayFilterTrack('sites', {
      hasQuery: Boolean(keyword),
      family: selectedFamily,
      payment: selectedPayment,
      visibleCount,
    });
  }

  function applyModelFilters({ track = true } = {}) {
    const { keyword, visibleCount } = filterModelEntries();
    renderGatewayList(gatewayLists.models);
    if (track) scheduleGatewayFilterTrack('models', {
      hasQuery: Boolean(keyword),
      visibleCount,
    });
  }

  function selectHasValue(select, value) {
    if (!select || !value) return false;
    return Array.from(select.options).some(option => option.value === value);
  }

  function readSiteFilterQueryParams() {
    const params = new URLSearchParams(window.location.search);
    const family = gatewayProviderSlug(params.get('provider') ?? '');
    const payment = (params.get('payment') || '').trim();
    return {
      family: selectHasValue(siteFamilySelect, family) ? family : '',
      payment: selectHasValue(sitePaymentSelect, payment) ? payment : '',
    };
  }

  function syncSiteFilterControlsFromQuery() {
    const { family, payment } = readSiteFilterQueryParams();
    if (siteFamilySelect) siteFamilySelect.value = family;
    if (sitePaymentSelect) sitePaymentSelect.value = payment;
    const status = new URLSearchParams(window.location.search).get('status') || '';
    if (siteStatusSelect) siteStatusSelect.value = selectHasValue(siteStatusSelect, status) ? status : '';
    if (siteFavoritesInput) siteFavoritesInput.checked = new URLSearchParams(window.location.search).get('favorites') === '1';
    const params = new URLSearchParams(window.location.search);
    if (family && params.get('provider') !== family) syncSiteFilterQueryFromControls();
  }

  function syncSiteFilterQueryFromControls() {
    const url = new URL(window.location.href);
    const selectedFamily = siteFamilySelect?.value || '';
    const selectedPayment = sitePaymentSelect?.value || '';
    if (selectedFamily) url.searchParams.set('provider', selectedFamily);
    else url.searchParams.delete('provider');
    if (selectedPayment) url.searchParams.set('payment', selectedPayment);
    else url.searchParams.delete('payment');
    if (siteStatusSelect?.value) url.searchParams.set('status', siteStatusSelect.value);
    else url.searchParams.delete('status');
    if (siteFavoritesInput?.checked) url.searchParams.set('favorites', '1');
    else url.searchParams.delete('favorites');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function hasActiveSiteFilters() {
    return Boolean(
      (siteSearchInput?.value || '').trim()
      || siteFamilySelect?.value
      || sitePaymentSelect?.value
      || siteStatusSelect?.value
      || siteFavoritesInput?.checked
    );
  }

  function hasActiveModelFilters() {
    return Boolean((modelSearchInput?.value || '').trim() || siteFamilySelect?.value);
  }

  function resetVisibleLimit(type) {
    gatewayLists[type].visibleLimit = gatewayLists[type].pageSize;
  }

  async function ensureGatewayDataLoaded(type) {
    const state = gatewayLists[type];
    if (!state || state.loaded) return 0;
    if (state.promise) return state.promise;
    const button = gatewayHome.querySelector(`[data-gateway-load-more="${type}"]`);
    if (!state.apiUrl) {
      state.loaded = true;
      return 0;
    }
    button?.setAttribute('disabled', 'disabled');
    setLoading(type, true);
    state.promise = (async () => {
      const response = await fetch(state.apiUrl, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const items = Array.isArray(payload.items) ? payload.items : [];
      const offset = Number(payload.offset) || state.pageSize;
      const totalCount = Number(payload.totalCount);
      if (Number.isFinite(totalCount) && totalCount > 0) state.totalCount = totalCount;
      const entries = type === 'sites'
        ? items.map((site, index) => siteEntryFromItem(site, offset + index))
        : items.map((model, index) => modelEntryFromItem(model, offset + index));
      state.entries.push(...entries);
      state.loaded = true;
      return entries.length;
    })();
    try {
      return await state.promise;
    } catch {
      button?.removeAttribute('disabled');
      return 0;
    } finally {
      state.promise = null;
      if (state.loaded) button?.removeAttribute('disabled');
      setLoading(type, false);
    }
  }

  async function applySharedFiltersWithDeferred({ track = true, resetLimit = false } = {}) {
    if (resetLimit) { resetVisibleLimit('sites'); resetVisibleLimit('models'); }
    await Promise.all([
      hasActiveSiteFilters() ? ensureGatewayDataLoaded('sites') : Promise.resolve(),
      hasActiveModelFilters() ? ensureGatewayDataLoaded('models') : Promise.resolve(),
    ]);
    applySiteFilters({ track });
    applyModelFilters({ track });
  }

  function applySiteFilterChange() {
    syncSiteFilterQueryFromControls();
    void applySharedFiltersWithDeferred({ resetLimit: true });
  }

  function showTab(tabName) {
    const changed = gatewayHome.querySelector('[data-gateway-tab][aria-selected="true"]')?.dataset.gatewayTab !== tabName;
    gatewayHome.querySelectorAll('[data-gateway-tab]').forEach(tab => {
      const active = tab.dataset.gatewayTab === tabName;
      tab.classList.toggle('tab-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    gatewayHome.querySelectorAll('[data-gateway-panel]').forEach(panel => {
      panel.hidden = panel.dataset.gatewayPanel !== tabName;
    });
    gatewayHome.querySelectorAll('[data-gateway-control]').forEach(control => { control.hidden = control.dataset.gatewayControl !== tabName; });
    if (tabName === 'sites') applySiteFilters({ track: false });
    if (changed) trackGatewayEvent('tab-change', { scope: 'gateway', tab: tabName });
  }

  async function loadMore(type) {
    const state = gatewayLists[type];
    if (!state) return;
    const loadedCount = await ensureGatewayDataLoaded(type);
    state.visibleLimit += state.pageSize;
    if (type === 'sites') applySiteFilters({ track: false });
    else applyModelFilters({ track: false });
    trackGatewayEvent('button-click', { scope: 'gateway', action: 'load-more', tab: type, loadedCount });
  }

  function nextSort(currentSort, button) {
    const key = button.dataset.sortKey || '';
    if (!key) return null;
    const currentDirection = currentSort?.key === key ? currentSort.direction : null;
    const direction = currentDirection === 'asc' ? 'desc' : (currentDirection === 'desc' ? null : 'asc');
    return direction ? { key, direction, type: button.dataset.sortType || 'text' } : null;
  }

  function updateSortButtons(state) {
    if (state.type === 'sites' && siteSortSelect) {
      siteSortSelect.value = !state.sort ? '' : ['score', 'modelCount'].includes(state.sort.key) && state.sort.direction === 'desc' ? state.sort.key : 'custom';
    }
    const table = gatewayHome.querySelector(state.listSelector)?.closest('[data-table]');
    window.updateDataTableHeaders?.(table, state.sort);
  }

  async function handleGatewaySort(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const table = target.closest('[data-table]');
    const panel = target.closest('[data-gateway-panel]');
    const type = panel?.dataset.gatewayPanel || '';
    const state = gatewayLists[type];
    if (!state || !table) return;
    if (target.closest('[data-inline-help]')) return;
    const button = target.closest('.data-table-sort-button') || target.closest('.data-table-head-cell-sortable')?.querySelector('.data-table-sort-button');
    if (!(button instanceof HTMLElement)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    await ensureGatewayDataLoaded(type);
    state.sort = nextSort(state.sort, button);
    resetVisibleLimit(type);
    if (type === 'sites') applySiteFilters({ track: false });
    else applyModelFilters({ track: false });
    trackGatewayEvent('sort-change', {
      scope: 'gateway',
      tab: type,
      key: button.dataset.sortKey || '',
      direction: state.sort?.direction || 'none',
    });
  }

  Object.values(gatewayLists).forEach(state => {
    const list = gatewayHome.querySelector(state.listSelector);
    state.entries = Array.from(list?.querySelectorAll(state.rowSelector) || [])
      .map((row, index) => entryFromRow(row, index, state.type));
    state.filteredEntries = state.entries.slice();
    updateLoadMoreButton(state);
  });

  gatewayHome.querySelectorAll('[data-gateway-tab]').forEach(tab => {
    tab.addEventListener('click', () => showTab(tab.dataset.gatewayTab || 'sites'));
  });
  siteSearchInput?.addEventListener('input', () => {
    if (modelSearchInput) modelSearchInput.value = siteSearchInput.value;
    void applySharedFiltersWithDeferred({ resetLimit: true });
  });
  siteFamilySelect?.addEventListener('change', applySiteFilterChange);
  sitePaymentSelect?.addEventListener('change', applySiteFilterChange);
  siteStatusSelect?.addEventListener('change', applySiteFilterChange);
  siteFavoritesInput?.addEventListener('change', applySiteFilterChange);
  gatewayHome.querySelector('[data-home-site-reset]')?.addEventListener('click', () => {
    for (const input of [siteSearchInput, modelSearchInput, siteFamilySelect, sitePaymentSelect, siteStatusSelect]) input.value = '';
    siteFavoritesInput.checked = false;
    applySiteFilterChange();
  });
  siteSortSelect?.addEventListener('change', async () => {
    const key = siteSortSelect.value;
    if (key === 'custom') return;
    await ensureGatewayDataLoaded('sites');
    gatewayLists.sites.sort = key ? { key, direction: 'desc', type: 'number' } : null;
    resetVisibleLimit('sites');
    applySiteFilters({ track: false });
    trackGatewayEvent('sort-change', { scope: 'gateway', tab: 'sites', key, direction: key ? 'desc' : 'none' });
  });
  modelSearchInput?.addEventListener('input', () => {
    if (siteSearchInput) siteSearchInput.value = modelSearchInput.value;
    void applySharedFiltersWithDeferred({ resetLimit: true });
  });
  gatewayHome.querySelectorAll('[data-gateway-load-more]').forEach(button => {
    button.addEventListener('click', () => loadMore(button.dataset.gatewayLoadMore || 'sites'));
  });
  gatewayHome.querySelectorAll('[data-table]').forEach(table => {
    table.addEventListener('click', handleGatewaySort, { capture: true });
  });
  syncSiteFilterControlsFromQuery();
  void applySharedFiltersWithDeferred({ track: false, resetLimit: true });
  window.addEventListener('popstate', () => {
    syncSiteFilterControlsFromQuery();
    void applySharedFiltersWithDeferred({ track: false, resetLimit: true });
  });
})();
