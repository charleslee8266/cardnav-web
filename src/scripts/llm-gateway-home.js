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

  function selectHasValue(select, value) {
    if (!select || !value) return false;
    return Array.from(select.options).some(option => option.value === value);
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

  function normalizeSiteFamilyParam(value) {
    return value.trim().toLowerCase();
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
    if (selectedFamily) {
      url.searchParams.set('model', selectedFamily);
    } else {
      url.searchParams.delete('model');
    }
    url.searchParams.delete('family');
    if (selectedPayment) {
      url.searchParams.set('payment', selectedPayment);
    } else {
      url.searchParams.delete('payment');
    }
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function applySiteFilters({ track = true } = {}) {
    const keyword = (siteSearchInput?.value || '').trim().toLowerCase();
    const selectedFamily = siteFamilySelect?.value || '';
    const selectedPayment = sitePaymentSelect?.value || '';
    let visibleCount = 0;
    gatewayHome.querySelectorAll('[data-home-site-card]').forEach(card => {
      const matchesKeyword = !keyword || (card.dataset.search || '').includes(keyword);
      const matchesFamily = !selectedFamily || (card.dataset.families || '').split(',').includes(selectedFamily);
      const matchesPayment = !selectedPayment || (card.dataset.payments || '').split(',').includes(selectedPayment);
      const visible = matchesKeyword && matchesFamily && matchesPayment;
      card.classList.toggle('hidden', !visible);
      if (visible) visibleCount += 1;
    });
    gatewayHome.querySelector('[data-home-site-empty]')?.classList.toggle('hidden', visibleCount > 0);
    if (track) scheduleGatewayFilterTrack('sites', {
      query: keyword,
      family: selectedFamily,
      payment: selectedPayment,
      visibleCount,
    });
  }

  function applyModelFilters({ track = true } = {}) {
    const keyword = (modelSearchInput?.value || '').trim().toLowerCase();
    let visibleCount = 0;
    gatewayHome.querySelectorAll('[data-home-model-card]').forEach(card => {
      const visible = !keyword || (card.dataset.search || '').includes(keyword);
      card.classList.toggle('hidden', !visible);
      if (visible) visibleCount += 1;
    });
    gatewayHome.querySelector('[data-home-model-empty]')?.classList.toggle('hidden', visibleCount > 0);
    if (track) scheduleGatewayFilterTrack('models', {
      query: keyword,
      visibleCount,
    });
  }

  function applySiteFilterChange() {
    syncSiteFilterQueryFromControls();
    applySiteFilters();
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
    const list = gatewayHome.querySelector(type === 'sites' ? '[data-gateway-home-sites-list]' : '[data-gateway-home-models-list]');
    const button = gatewayHome.querySelector(`[data-gateway-load-more="${type}"]`);
    const apiUrl = type === 'sites' ? config.sitesApi : config.modelsApi;
    if (!list || !button || !apiUrl) return;
    button.setAttribute('disabled', 'disabled');
    try {
      const response = await fetch(apiUrl, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const items = Array.isArray(payload.items) ? payload.items : [];
      const offset = Number(payload.offset) || 20;
      const rows = type === 'sites'
        ? items.map((site, index) => siteRowElement(site, offset + index))
        : items.map((model, index) => modelRowElement(model, offset + index));
      if (rows.length) list.append(...rows);
      button.closest('div')?.remove();
      window.initSortableTables?.(gatewayHome);
      const table = list.closest('[data-sortable-table]');
      if (table) window.applySortableTableSort?.(table);
      if (type === 'sites') applySiteFilters({ track: false });
      else applyModelFilters({ track: false });
      trackGatewayEvent('gateway-load-more-click', { name: type, loadedCount: rows.length });
    } catch {
      button.removeAttribute('disabled');
    }
  }

  gatewayHome.querySelectorAll('[data-gateway-tab]').forEach(tab => {
    tab.addEventListener('click', () => showTab(tab.dataset.gatewayTab || 'sites'));
  });
  siteSearchInput?.addEventListener('input', applySiteFilters);
  siteFamilySelect?.addEventListener('change', applySiteFilterChange);
  sitePaymentSelect?.addEventListener('change', applySiteFilterChange);
  modelSearchInput?.addEventListener('input', applyModelFilters);
  gatewayHome.querySelectorAll('[data-gateway-load-more]').forEach(button => {
    button.addEventListener('click', () => loadMore(button.dataset.gatewayLoadMore || 'sites'), { once: true });
  });
  gatewayHome.querySelectorAll('[data-sort-key]').forEach(button => {
    button.addEventListener('click', () => {
      const table = button.closest('[data-sortable-table]');
      const panel = button.closest('[data-gateway-panel]');
      const currentDirection = table?.dataset.sortDirection || 'none';
      trackGatewayEvent('gateway-sort-click', {
        tab: panel?.dataset.gatewayPanel || 'unknown',
        key: button.dataset.sortKey || '',
        direction: currentDirection === 'asc' ? 'desc' : 'asc',
      });
    });
  });
  syncSiteFilterControlsFromQuery();
  applySiteFilters({ track: false });
  window.addEventListener('popstate', () => {
    syncSiteFilterControlsFromQuery();
    applySiteFilters({ track: false });
  });
})();
