/*
 * 文件说明: 中转站首页标签页、本地筛选、URL 查询参数同步、懒加载与排序埋点交互。
 */
import { formatPositiveScore, paymentIcon, uniqueLabels } from '../gateway-display.js';

(() => {
  const gatewayHome = document.querySelector('[data-gateway-home]');
  if (!gatewayHome) return;

  const config = JSON.parse(document.getElementById('gateway-home-config')?.textContent || '{}');
  const paymentMethodLabels = config.paymentMethodLabels || {};
  const siteSearchInput = gatewayHome.querySelector('[data-home-site-search]');
  const siteFamilySelect = gatewayHome.querySelector('[data-home-site-family]');
  const sitePaymentSelect = gatewayHome.querySelector('[data-home-site-payment]');
  const modelSearchInput = gatewayHome.querySelector('[data-home-model-search]');
  const INITIAL_RENDER_LIMIT = 20;
  const RENDER_STEP = 20;
  const gatewayLists = {
    sites: {
      type: 'sites',
      listSelector: '[data-gateway-home-sites-list]',
      rowSelector: '[data-home-site-card]',
      emptySelector: '[data-home-site-empty]',
      apiUrl: config.sitesApi,
      loaded: !gatewayHome.querySelector('[data-gateway-load-more="sites"]'),
      promise: null,
      visibleLimit: INITIAL_RENDER_LIMIT,
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
      visibleLimit: INITIAL_RENDER_LIMIT,
      entries: [],
      filteredEntries: [],
      sort: null,
    },
  };
  let gatewayFilterTrackTimer = null;
  let lastGatewayFilterTrackKey = '';

  function trackGatewayEvent(eventName, eventData = {}) {
    if (typeof window.umami?.track !== 'function') return;
    window.umami.track(eventName, eventData);
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

  function gatewaySiteTracking(site) {
    const targetPage = `${config.gatewayLinkPrefix}/${site.slug}`;
    return {
      umamiEvent: 'gateway-site-click',
      umamiEventName: site.name,
      umamiEventTargetPage: targetPage,
      umamiEventUrl: targetPage,
    };
  }

  function gatewaySiteOpenTracking(site) {
    return {
      umamiEvent: 'gateway-site-open-click',
      umamiEventName: site.name,
      umamiEventUrl: site.outboundUrl || site.url,
    };
  }

  function gatewayModelTracking(model) {
    const targetPage = `${config.modelLinkPrefix}/${encodeURIComponent(model.modelId)}`;
    return {
      umamiEvent: 'gateway-model-click',
      umamiEventName: model.modelId,
      umamiEventFamily: model.modelFamily,
      umamiEventTargetPage: targetPage,
      umamiEventUrl: targetPage,
    };
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
    const families = uniqueLabels(site.displayModelFamilies, 8);
    const payments = uniqueLabels(site.paymentMethods, 6);
    const search = `${site.name} ${site.url} ${site.host} ${(site.displayModelFamilies || []).join(' ')} ${(site.paymentMethods || []).map(paymentLabel).join(' ')}`.toLowerCase();
    const row = document.createElement('tr');
    row.setAttribute('data-home-site-card', '');
    setDataset(row, {
      search,
      families: families.map(item => item.toLowerCase()).join(','),
      payments: payments.join(','),
      originalOrder: index,
      sortRank: index + 1,
      sortName: site.name,
      sortScore: Number(site.siteScore) || 0,
      sortFamilies: families.join(' '),
      sortModelCount: Number(site.modelCount) || 0,
      sortPayments: payments.map(paymentLabel).join(' '),
    });

    row.append(el('td', 'font-mono text-sm text-primary', `#${index + 1}`));
    row.lastElementChild.dataset.label = config.rankLabel;

    const infoCell = document.createElement('td');
    infoCell.dataset.label = config.basicInfoLabel;
    const infoWrap = el('div', 'flex flex-col gap-3 sm:flex-row sm:items-stretch sm:justify-between');
    const textWrap = el('div', 'min-w-0 space-y-2');
    const titleWrap = el('div', 'flex flex-wrap items-center gap-2');
    const siteLink = el('a', 'link link-hover break-words text-base font-semibold text-primary', site.name);
    siteLink.href = `${config.gatewayLinkPrefix}/${site.slug}`;
    setTracking(siteLink, gatewaySiteTracking(site));
    titleWrap.append(siteLink);
    if (site.displayFamily) titleWrap.append(el('span', 'badge badge-ghost font-medium', site.displayFamily));
    textWrap.append(titleWrap);
    if (site.summary) textWrap.append(el('p', 'max-w-3xl text-sm leading-6 text-base-content/72', site.summary));
    const urlWrap = el('div', 'text-xs text-base-content/55');
    urlWrap.append(el('span', 'break-all', site.url));
    textWrap.append(urlWrap);
    const actionWrap = el('div', 'inline-flex shrink-0 items-center gap-2 self-start sm:self-center');
    const detailLink = el('a', 'btn btn-primary btn-xs inline-flex h-7 min-h-7 items-center px-3 leading-none', config.detailLabel);
    detailLink.href = `${config.gatewayLinkPrefix}/${site.slug}`;
    setTracking(detailLink, gatewaySiteTracking(site));
    const openLink = el('a', 'btn btn-outline btn-xs inline-flex h-7 min-h-7 items-center px-3 leading-none', config.openLabel);
    openLink.href = site.outboundUrl || site.url;
    openLink.target = '_blank';
    openLink.rel = 'noopener noreferrer';
    setTracking(openLink, gatewaySiteOpenTracking(site));
    actionWrap.append(detailLink, openLink);
    infoWrap.append(textWrap, actionWrap);
    infoCell.append(infoWrap);
    row.append(infoCell);

    row.append(el('td', 'font-mono', formatPositiveScore(site.siteScore)));
    row.lastElementChild.dataset.label = config.scoreLabel;

    const familiesCell = document.createElement('td');
    familiesCell.dataset.label = config.supportedModelsLabel;
    if (families.length) {
      const wrap = el('div', 'flex flex-wrap gap-1.5');
      families.forEach(family => wrap.append(el('span', 'badge badge-primary badge-outline badge-sm', family)));
      familiesCell.append(wrap);
    } else {
      familiesCell.append(el('span', 'text-base-content/35', '-'));
    }
    row.append(familiesCell);

    row.append(el('td', 'font-mono', site.modelCount > 0 ? site.modelCount : '-'));
    row.lastElementChild.dataset.label = config.modelCountLabel;

    const paymentsCell = document.createElement('td');
    paymentsCell.dataset.label = config.paymentMethodsLabel;
    paymentsCell.append(payments.length ? paymentBadges(payments) : el('span', 'text-base-content/35', '-'));
    row.append(paymentsCell);
    return row;
  }

  function modelRowElement(model, index) {
    const row = document.createElement('tr');
    row.setAttribute('data-home-model-card', '');
    setDataset(row, {
      search: `${model.modelId} ${model.modelFamily}`.toLowerCase(),
      originalOrder: index,
      sortRank: index + 1,
      sortModel: model.modelId,
      sortFamily: model.modelFamily,
      sortSupportCount: Number(model.supportSiteCount) || 0,
    });
    row.append(el('td', 'font-mono text-sm text-secondary', `#${index + 1}`));
    row.lastElementChild.dataset.label = config.rankLabel;
    const modelCell = document.createElement('td');
    modelCell.dataset.label = config.modelLabel;
    const modelLink = el('a', 'link link-hover break-words font-mono text-sm font-semibold text-primary', model.modelId);
    modelLink.href = `${config.modelLinkPrefix}/${encodeURIComponent(model.modelId)}`;
    setTracking(modelLink, gatewayModelTracking(model));
    modelCell.append(modelLink);
    row.append(modelCell);
    row.append(el('td', '', model.modelFamily));
    row.lastElementChild.dataset.label = config.modelFamilyLabel;
    row.append(el('td', 'font-mono', model.supportSiteCount));
    row.lastElementChild.dataset.label = config.supportedGatewayCountLabel;
    return row;
  }

  function scheduleGatewayFilterTrack(tab, payload) {
    clearTimeout(gatewayFilterTrackTimer);
    gatewayFilterTrackTimer = setTimeout(() => {
      const eventData = { tab, ...payload };
      const eventKey = JSON.stringify(eventData);
      if (eventKey === lastGatewayFilterTrackKey) return;
      lastGatewayFilterTrackKey = eventKey;
      trackGatewayEvent('gateway-filter-change', eventData);
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
      sort: type === 'sites' ? {
        rank: rowSortValue(row, 'rank', 'number'),
        name: rowSortValue(row, 'name'),
        score: rowSortValue(row, 'score', 'number'),
        families: rowSortValue(row, 'families'),
        modelCount: rowSortValue(row, 'modelCount', 'number'),
        payments: rowSortValue(row, 'payments'),
      } : {
        rank: rowSortValue(row, 'rank', 'number'),
        model: rowSortValue(row, 'model'),
        family: rowSortValue(row, 'family'),
        supportCount: rowSortValue(row, 'supportCount', 'number'),
      },
    };
  }

  function siteEntryFromItem(site, index) {
    const families = uniqueLabels(site.displayModelFamilies, 8);
    const payments = uniqueLabels(site.paymentMethods, 6);
    const search = `${site.name} ${site.url} ${site.host} ${(site.displayModelFamilies || []).join(' ')} ${(site.paymentMethods || []).map(paymentLabel).join(' ')}`.toLowerCase();
    return {
      index,
      row: null,
      item: site,
      search,
      families: families.map(item => item.toLowerCase()).join(','),
      payments: payments.join(','),
      sort: {
        rank: index + 1,
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
      search: `${model.modelId} ${model.modelFamily}`.toLowerCase(),
      families: '',
      payments: '',
      sort: {
        rank: index + 1,
        model: model.modelId,
        family: model.modelFamily,
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
    if (state.sort) entries.sort(compareEntries(state.sort));
    else entries.sort((left, right) => left.index - right.index);
    return entries;
  }

  function loadMoreWrap(type) {
    return gatewayHome.querySelector(`[data-gateway-load-more="${type}"]`)?.closest('div') || null;
  }

  function updateLoadMoreButton(state) {
    const button = gatewayHome.querySelector(`[data-gateway-load-more="${state.type}"]`);
    const wrap = loadMoreWrap(state.type);
    if (!button || !wrap) return;
    const hasMoreRenderedRows = state.filteredEntries.length > state.visibleLimit;
    const canLoadDeferredRows = !state.loaded;
    wrap.classList.toggle('hidden', !(hasMoreRenderedRows || canLoadDeferredRows));
  }

  function renderGatewayList(state) {
    const list = gatewayHome.querySelector(state.listSelector);
    if (!list) return;
    const entries = currentEntries(state);
    const rows = entries.slice(0, state.visibleLimit).map(entry => ensureEntryRow(entry, state.type));
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
      return matchesKeyword && matchesFamily && matchesPayment;
    });
    return { keyword, selectedFamily, selectedPayment, visibleCount: state.filteredEntries.length };
  }

  function filterModelEntries() {
    const keyword = (modelSearchInput?.value || '').trim().toLowerCase();
    const state = gatewayLists.models;
    state.filteredEntries = state.entries.filter(entry => !keyword || entry.search.includes(keyword));
    return { keyword, visibleCount: state.filteredEntries.length };
  }

  function applySiteFilters({ track = true } = {}) {
    const { keyword, selectedFamily, selectedPayment, visibleCount } = filterSiteEntries();
    renderGatewayList(gatewayLists.sites);
    if (track) scheduleGatewayFilterTrack('sites', {
      query: keyword,
      family: selectedFamily,
      payment: selectedPayment,
      visibleCount,
    });
  }

  function applyModelFilters({ track = true } = {}) {
    const { keyword, visibleCount } = filterModelEntries();
    renderGatewayList(gatewayLists.models);
    if (track) scheduleGatewayFilterTrack('models', {
      query: keyword,
      visibleCount,
    });
  }

  function selectHasValue(select, value) {
    if (!select || !value) return false;
    return Array.from(select.options).some(option => option.value === value);
  }

  function normalizeSiteFamilyParam(value) {
    return value.trim().toLowerCase();
  }

  function readSiteFilterQueryParams() {
    const params = new URLSearchParams(window.location.search);
    const family = normalizeSiteFamilyParam(params.get('model') || params.get('family') || '');
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
  }

  function syncSiteFilterQueryFromControls() {
    const url = new URL(window.location.href);
    const selectedFamily = siteFamilySelect?.value || '';
    const selectedPayment = sitePaymentSelect?.value || '';
    if (selectedFamily) url.searchParams.set('model', selectedFamily);
    else url.searchParams.delete('model');
    url.searchParams.delete('family');
    if (selectedPayment) url.searchParams.set('payment', selectedPayment);
    else url.searchParams.delete('payment');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function hasActiveSiteFilters() {
    return Boolean(
      (siteSearchInput?.value || '').trim()
      || siteFamilySelect?.value
      || sitePaymentSelect?.value
    );
  }

  function hasActiveModelFilters() {
    return Boolean((modelSearchInput?.value || '').trim());
  }

  function resetVisibleLimit(type) {
    gatewayLists[type].visibleLimit = INITIAL_RENDER_LIMIT;
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
    state.promise = (async () => {
      const response = await fetch(state.apiUrl, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const items = Array.isArray(payload.items) ? payload.items : [];
      const offset = Number(payload.offset) || INITIAL_RENDER_LIMIT;
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
    }
  }

  async function applySiteFiltersWithDeferred({ track = true, resetLimit = false } = {}) {
    if (resetLimit) resetVisibleLimit('sites');
    if (hasActiveSiteFilters()) await ensureGatewayDataLoaded('sites');
    applySiteFilters({ track });
  }

  async function applyModelFiltersWithDeferred({ track = true, resetLimit = false } = {}) {
    if (resetLimit) resetVisibleLimit('models');
    if (hasActiveModelFilters()) await ensureGatewayDataLoaded('models');
    applyModelFilters({ track });
  }

  function applySiteFilterChange() {
    syncSiteFilterQueryFromControls();
    void applySiteFiltersWithDeferred({ resetLimit: true });
  }

  function showTab(tabName) {
    gatewayHome.querySelectorAll('[data-gateway-tab]').forEach(tab => {
      const active = tab.dataset.gatewayTab === tabName;
      tab.classList.toggle('tab-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    gatewayHome.querySelectorAll('[data-gateway-panel]').forEach(panel => {
      panel.hidden = panel.dataset.gatewayPanel !== tabName;
    });
    trackGatewayEvent('gateway-tab-click', { name: tabName });
  }

  async function loadMore(type) {
    const state = gatewayLists[type];
    if (!state) return;
    const loadedCount = await ensureGatewayDataLoaded(type);
    state.visibleLimit += RENDER_STEP;
    if (type === 'sites') applySiteFilters({ track: false });
    else applyModelFilters({ track: false });
    trackGatewayEvent('gateway-load-more-click', { name: type, loadedCount });
  }

  function nextSort(currentSort, button) {
    const key = button.dataset.sortKey || '';
    if (!key) return null;
    const currentDirection = currentSort?.key === key ? currentSort.direction : null;
    const direction = currentDirection === 'asc' ? 'desc' : (currentDirection === 'desc' ? null : 'asc');
    return direction ? { key, direction, type: button.dataset.sortType || 'text' } : null;
  }

  function updateSortButtons(state) {
    const table = gatewayHome.querySelector(state.listSelector)?.closest('[data-sortable-table]');
    table?.querySelectorAll('.flat-sort-button').forEach(button => {
      const active = state.sort?.key === button.dataset.sortKey;
      const headerCell = button.closest('th');
      if (headerCell) headerCell.setAttribute('aria-sort', active ? (state.sort.direction === 'asc' ? 'ascending' : 'descending') : 'none');
      button.dataset.sortDirection = active ? state.sort.direction : '';
      const indicator = button.querySelector('.sort-indicator');
      if (indicator) indicator.dataset.sortDirection = active ? state.sort.direction : '';
    });
  }

  function handleGatewaySort(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const table = target.closest('[data-sortable-table]');
    const panel = target.closest('[data-gateway-panel]');
    const type = panel?.dataset.gatewayPanel || '';
    const state = gatewayLists[type];
    if (!state || !table) return;
    const button = target.closest('.flat-sort-button') || target.closest('.flat-sort-head')?.querySelector('.flat-sort-button');
    if (!(button instanceof HTMLElement)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    state.sort = nextSort(state.sort, button);
    resetVisibleLimit(type);
    if (type === 'sites') applySiteFilters({ track: false });
    else applyModelFilters({ track: false });
    trackGatewayEvent('gateway-sort-click', {
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
    void applySiteFiltersWithDeferred({ resetLimit: true });
  });
  siteFamilySelect?.addEventListener('change', applySiteFilterChange);
  sitePaymentSelect?.addEventListener('change', applySiteFilterChange);
  modelSearchInput?.addEventListener('input', () => {
    void applyModelFiltersWithDeferred({ resetLimit: true });
  });
  gatewayHome.querySelectorAll('[data-gateway-load-more]').forEach(button => {
    button.addEventListener('click', () => loadMore(button.dataset.gatewayLoadMore || 'sites'));
  });
  gatewayHome.querySelectorAll('[data-sortable-table]').forEach(table => {
    table.addEventListener('click', handleGatewaySort, { capture: true });
  });
  syncSiteFilterControlsFromQuery();
  void applySiteFiltersWithDeferred({ track: false, resetLimit: true });
  window.addEventListener('popstate', () => {
    syncSiteFilterControlsFromQuery();
    void applySiteFiltersWithDeferred({ track: false, resetLimit: true });
  });
})();
