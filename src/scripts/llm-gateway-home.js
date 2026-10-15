import { syncTableSortHeaders } from './table-sort-headers.js';
import { createListLoading } from './list-loading.js';
import { nextTableSort } from '../table-sort.js';
import { bindProviderSelection, createProviderSelection } from '../models/provider-selection.js';
import { bindFamilySelection, createModelFamilySelection } from '../models/family-selection.js';
import { matchesAllSelections } from '../models/gateway-selection.js';
import { createRelatedLink } from '../models/related-link.js';
import { gatewayModelPath } from '../models/routes.js';
import { renderModelFamilyList } from '../models/family-list.js';
import { createScoreDisplay } from '../data-display.js';
import { renderFilterSummary } from './filter-summary.js';
import { gatewayProviderSlug } from '../models/routes.js';
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
  const filterGroups = Object.fromEntries(['family', 'payment', 'status'].map(name => [name, gatewayHome.querySelector(`[data-multi-filter="${name}"]`)]));
  const modelFamilyGroup = gatewayHome.querySelector('[data-multi-filter="model-family"]');
  const modelProviderGroup = gatewayHome.querySelector('[data-multi-filter="model-provider"]');
  const modelProviders = () => [...modelProviderGroup.querySelectorAll('input:checked')].map(input => input.value);
  const modelFilterGroups = [modelFamilyGroup, modelProviderGroup];
  const modelFamilies = () => [...modelFamilyGroup.querySelectorAll('input:checked')].map(input => input.value);
  const activeTab = () => gatewayHome.querySelector('[data-gateway-tab][aria-selected="true"]')?.dataset.gatewayTab || 'sites';
  const selectedValues = name => Array.from(filterGroups[name]?.querySelectorAll('input:checked') || []).map(input => input.value);
  const matchesAny = (selected, values) => !selected.length || selected.some(value => values.includes(value));
  function updateMultiSummaries() {
    for (const group of [...Object.values(filterGroups), ...modelFilterGroups]) {
      const summary = group.querySelector('[data-multi-summary]');
      const selected = Array.from(group.querySelectorAll('input:checked'));
      summary.textContent = selected.length ? `${summary.dataset.emptyLabel} · ${selected.length}` : summary.dataset.emptyLabel;
    }
  }
  const siteFavoritesInput = gatewayHome.querySelector('[data-home-site-favorites]');
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
  for (const state of Object.values(gatewayLists)) {
    state.loading = createListLoading(gatewayHome.querySelector(state.listSelector).closest('.data-table-frame'));
  }
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
    const targetPage = gatewayModelPath(model.modelId, modelLinkPrefix);
    return {
      umamiEvent: 'internal-link-click',
      umamiEventLinkType: 'gateway-model',
      umamiEventName: model.modelId,
      umamiEventFamily: model.modelFamily || undefined,
      umamiEventTargetPage: targetPage,
      umamiEventUrl: targetPage,
    };
  }

  function isStickySite(site) {
    return Boolean(site.sponsor);
  }

  function paymentBadges(payments) {
    const wrap = el('div', 'flex flex-wrap gap-1');
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
    const families = site.displayModelFamilies || [];
    const payments = uniqueLabels(site.paymentMethods, 6);
    const search = `${site.name} ${site.url} ${site.host} ${(site.displayModelProviders || []).join(' ')} ${(site.displayModelFamilies || []).join(' ')} ${(site.paymentMethods || []).map(paymentLabel).join(' ')}`.toLowerCase();
    const row = document.createElement('tr');
    row.setAttribute('data-home-site-card', '');
    setDataset(row, {
      search,
      families: (site.displayModelFamilies || []).map(gatewayProviderSlug).join(','),
      providers: (site.displayModelProviders || []).map(gatewayProviderSlug).join(','),
      payments: (site.paymentMethods || []).join(','),
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
    const contentWrap = el('div', 'data-entity-content');
    const textWrap = el('div', 'data-entity-copy');
    const titleWrap = el('div', 'merchant-header');
    const siteLink = el('a', 'merchant-link', site.name);
    siteLink.dataset.rowPrimary = '';
    siteLink.href = `${gatewayLinkPrefix}/${site.slug}`;
    setTracking(siteLink, gatewaySiteTracking(site));
    infoWrap.append(favorites.create(site.slug, site.name));
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
    contentWrap.append(textWrap, actionWrap);
    infoWrap.append(contentWrap);
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
    familiesCell.innerHTML = renderModelFamilyList(families, config.supportedModelsLabel, 'gateway-sites');
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
      search: `${model.modelId} ${model.modelProvider} ${model.modelFamily || ''}`.toLowerCase(),
      originalOrder: index,
      sortSequence: index + 1,
      sortModel: model.modelId,
      sortFamily: model.modelFamily || '',
      sortProvider: model.modelProvider,
      sortReleaseDate: model.releaseDate || '',
      sortSupportCount: Number(model.supportSiteCount) || 0,
    });
    const sequenceCell = tableCell(config.sequenceLabel, 'center', '', { sequence: true });
    sequenceCell.textContent = String(index + 1);
    row.append(sequenceCell);
    const modelCell = tableCell(config.modelLabel);
    const modelLink = el('a', 'data-row-model-name break-words font-mono text-sm font-semibold', model.modelId);
    modelLink.dataset.rowPrimary = '';
    modelLink.href = gatewayModelPath(model.modelId, modelLinkPrefix);
    setTracking(modelLink, gatewayModelTracking(model));
    modelCell.append(modelLink);
    row.append(modelCell);
    const familyCell = tableCell(config.modelFamilyLabel);
    familyCell.append(model.modelFamily ? createModelFamilySelection(model.modelFamily, 'gateway-models') : document.createTextNode('—'));
    row.append(familyCell);
    const providerCell = tableCell(config.modelProviderLabel);
    providerCell.append(createProviderSelection(model.modelProvider, 'gateway-models'));
    row.append(providerCell);
    const releaseDateCell = tableCell(config.releaseDateLabel, 'left', 'whitespace-nowrap font-mono');
    if (model.releaseDate) {
      const date = el('time', '', model.releaseDate);
      date.dateTime = model.releaseDate;
      releaseDateCell.append(date);
    } else releaseDateCell.textContent = '—';
    row.append(releaseDateCell);
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
      providers: row.dataset.providers || '',
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
        provider: rowSortValue(row, 'provider'),
        releaseDate: rowSortValue(row, 'releaseDate'),
        supportCount: rowSortValue(row, 'supportCount', 'number'),
      },
    };
  }

  function siteEntryFromItem(site, index) {
    const families = site.displayModelFamilies || [];
    const payments = uniqueLabels(site.paymentMethods, 6);
    const search = `${site.name} ${site.url} ${site.host} ${(site.displayModelProviders || []).join(' ')} ${(site.displayModelFamilies || []).join(' ')} ${(site.paymentMethods || []).map(paymentLabel).join(' ')}`.toLowerCase();
    return {
      index,
      row: null,
      item: site,
      search,
      families: (site.displayModelFamilies || []).map(gatewayProviderSlug).join(','),
      providers: (site.displayModelProviders || []).map(gatewayProviderSlug).join(','),
      payments: (site.paymentMethods || []).join(','),
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
      search: `${model.modelId} ${model.modelProvider} ${model.modelFamily || ''}`.toLowerCase(),
      families: '',
      payments: '',
      sort: {
        sequence: index + 1,
        model: model.modelId,
        family: model.modelFamily || '',
        provider: model.modelProvider,
        releaseDate: model.releaseDate || '',
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
      if (sort.key === 'releaseDate' && (!leftValue || !rightValue)) {
        return leftValue ? -1 : rightValue ? 1 : left.index - right.index;
      }
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
    if (state.sort) entries.sort(compareEntries(state.sort));
    return pinSiteRows(entries.map(entry => ({ entry, sponsor: Number(entry.sort.sticky) > 0, supportTotalCents: 0, supportPoints: Number(entry.sort.support) || 0, favorite: Number(entry.sort.favorite) > 0 })), (row, kind) => { row.entry.pinKind = kind; }, !state.sort).map(row => row.entry);
  }

  function loadMoreWrap(type) {
    return gatewayHome.querySelector(`[data-gateway-load-more="${type}"]`)?.closest('[data-table-load-more]') || null;
  }

  function summaryLabel(type) {
    return gatewayHome.querySelector(`[data-gateway-load-summary="${type}"]`);
  }

  function displaySummaryText(renderedCount, totalCount) {
    return (config.displaySummary || 'Showing {rendered} / {total}')
      .replace('{rendered}', String(renderedCount))
      .replace('{total}', String(totalCount));
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
    const selectedFamily = selectedValues('family');
    const selectedPayment = selectedValues('payment');
    const state = gatewayLists.sites;
    state.filteredEntries = state.entries.filter(entry => {
      const matchesKeyword = !keyword || entry.search.includes(keyword);
      const matchesFamily = matchesAllSelections(selectedFamily, entry.families.split(','));
      const matchesPayment = matchesAllSelections(selectedPayment, entry.payments.split(','));
      const status = entry.priceCount > 0 ? 'hasPrice' : entry.sort.modelCount > 0 ? 'noPrice' : 'noData';
      const matchesStatus = matchesAny(selectedValues('status'), [status]);
      const matchesFavorite = !siteFavoritesInput?.checked || favorites.has(entry.item?.slug || entry.row?.dataset.gatewaySiteKey || '');
      return matchesKeyword && matchesFamily && matchesPayment && matchesStatus && matchesFavorite;
    });
    return { keyword, selectedFamily, selectedPayment, visibleCount: state.filteredEntries.length };
  }

  function filterModelEntries() {
    const keyword = (modelSearchInput?.value || '').trim().toLowerCase();
    const state = gatewayLists.models;
    const family = modelFamilies();
    const providers = modelProviders();
    state.filteredEntries = state.entries.filter(entry => (!keyword || entry.search.includes(keyword)) && matchesAny(family, [gatewayProviderSlug(entry.sort.family)]) && matchesAny(providers, [gatewayProviderSlug(entry.sort.provider)]));
    return { keyword, visibleCount: state.filteredEntries.length };
  }

  function applySiteFilters({ track = true } = {}) {
    const { keyword, selectedFamily, selectedPayment, visibleCount } = filterSiteEntries();
    renderGatewayList(gatewayLists.sites);
    renderFilterSummary(gatewayHome.querySelector('[data-home-site-active-filters]'), [...Object.values(filterGroups).flatMap(group => [...group.querySelectorAll('[data-filter-value]')]), siteFavoritesInput].map(input => ({
      input,
      label: () => input.closest('label').textContent.trim(),
    })), {
      clearLabel: config.clearFilters,
      countElement: gatewayHome.querySelector('#gatewaySiteFilters').closest('[data-filter-popover]').querySelector('[data-filter-count]'),
      onChange: applySiteFilterChange,
    });
    updateMultiSummaries();
    if (activeTab() === 'sites') renderFamilyLinks();
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
    renderFilterSummary(gatewayHome.querySelector('[data-home-model-active-filters]'), modelFilterGroups.flatMap(group => [...group.querySelectorAll('input')]).map(input => ({ input, label: () => input.closest('label').textContent.trim() })), {
      clearLabel: config.clearFilters,
      countElement: gatewayHome.querySelector('#gatewayModelFilters').closest('[data-filter-popover]').querySelector('[data-filter-count]'),
      onChange: applyModelFilterChange,
    });
    updateMultiSummaries();
    if (activeTab() === 'models') renderFamilyLinks();
    if (track) scheduleGatewayFilterTrack('models', {
      hasQuery: Boolean(keyword),
      visibleCount,
    });
  }

  function renderFamilyLinks() {
    const container = gatewayHome.querySelector('[data-home-family-links]');
    const selected = activeTab() === 'models' ? modelFamilies() : selectedValues('family');
    const firstFamily = (config.familyOrder || []).find(family => selected.includes(family));
    const entry = (config.familyLinks || []).find(item => item.family === firstFamily);
    container.replaceChildren();
    container.hidden = !entry;
    if (!entry) return;
    [entry.shop, entry.official, entry.leaderboard].forEach((href, index) => {
      if (!href) return;
      container.append(createRelatedLink({ href, label: config.relatedLabels[index].replace('{term}', entry.name) }));
    });
  }

  function syncSiteFilterControlsFromQuery() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('provider')) {
      params.delete('provider');
      window.history.replaceState(null, '', `${window.location.pathname}${params.size ? '?' + params : ''}${window.location.hash}`);
    }
    for (const [name, group] of Object.entries(filterGroups)) {
      const values = params.getAll(name).map(value => ['family', 'provider'].includes(name) ? gatewayProviderSlug(value) : value.trim());
      for (const input of group.querySelectorAll('input')) input.checked = values.includes(input.value);
    }
    if (siteFavoritesInput) siteFavoritesInput.checked = params.get('favorites') === '1';
    modelFilterGroups.forEach(group => group.querySelectorAll('input').forEach(input => { input.checked = params.getAll(group.dataset.multiFilter).includes(input.value); }));
    if (siteSearchInput) siteSearchInput.value = params.get('q') || '';
    if (modelSearchInput) modelSearchInput.value = params.get('model-q') || '';
  }

  function syncSiteFilterQueryFromControls() {
    const url = new URL(window.location.href);
    url.searchParams.delete('provider');
    for (const name of Object.keys(filterGroups)) {
      url.searchParams.delete(name);
      for (const value of selectedValues(name)) url.searchParams.append(name, value);
    }
    if (siteFavoritesInput?.checked) url.searchParams.set('favorites', '1');
    else url.searchParams.delete('favorites');
    for (const group of modelFilterGroups) {
      url.searchParams.delete(group.dataset.multiFilter);
      group.querySelectorAll('input:checked').forEach(input => url.searchParams.append(group.dataset.multiFilter, input.value));
    }
    for (const [key, value] of [['q', siteSearchInput?.value || ''], ['model-q', modelSearchInput?.value || '']]) { if (value) url.searchParams.set(key, value); else url.searchParams.delete(key); }
    if (activeTab() === 'models') url.searchParams.set('tab', 'models'); else url.searchParams.delete('tab');
    const next = `${url.pathname}${url.search}${url.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.pushState(null, '', next);
  }

  function hasActiveSiteFilters() {
    return Boolean((siteSearchInput?.value || '').trim() || Object.keys(filterGroups).some(name => selectedValues(name).length) || siteFavoritesInput?.checked);
  }

  function hasActiveModelFilters() {
    return Boolean((modelSearchInput?.value || '').trim() || modelFamilies().length || modelProviders().length);
  }

  function resetVisibleLimit(type) {
    gatewayLists[type].visibleLimit = gatewayLists[type].pageSize;
  }

  async function ensureGatewayDataLoaded(type, anchor = null) {
    const state = gatewayLists[type];
    if (!state || state.loaded) return 0;
    if (state.promise) return state.promise;
    const button = gatewayHome.querySelector(`[data-gateway-load-more="${type}"]`);
    if (!state.apiUrl) {
      state.loaded = true;
      return 0;
    }
    button?.setAttribute('disabled', 'disabled');
    state.promise = state.loading.run(async () => {
      const response = await fetch(state.apiUrl, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload.items)) throw new Error('Invalid list response');
      const items = payload.items;
      const offset = Number(payload.offset) || state.pageSize;
      const totalCount = Number(payload.totalCount);
      if (Number.isFinite(totalCount) && totalCount > 0) state.totalCount = totalCount;
      const entries = type === 'sites'
        ? items.map((site, index) => siteEntryFromItem(site, offset + index))
        : items.map((model, index) => modelEntryFromItem(model, offset + index));
      state.entries.push(...entries);
      state.loaded = true;
      return entries.length;
    }, { anchor }).catch(() => null).finally(() => {
      state.promise = null;
      button?.removeAttribute('disabled');
      updateLoadMoreButton(state);
    });
    return state.promise;
  }

  async function applySharedFiltersWithDeferred({ track = true, resetLimit = false } = {}) {
    if (resetLimit) { resetVisibleLimit('sites'); resetVisibleLimit('models'); }
    const [sites, models] = await Promise.all([
      hasActiveSiteFilters() ? ensureGatewayDataLoaded('sites') : Promise.resolve(0),
      hasActiveModelFilters() ? ensureGatewayDataLoaded('models') : Promise.resolve(0),
    ]);
    if (sites !== null) applySiteFilters({ track });
    if (models !== null) applyModelFilters({ track });
  }

  function applySiteFilterChange() {
    syncSiteFilterQueryFromControls();
    resetVisibleLimit('sites');
    void (hasActiveSiteFilters() ? ensureGatewayDataLoaded('sites') : Promise.resolve()).then(result => { if (result !== null) applySiteFilters(); });
  }

  function applyModelFilterChange() {
    syncSiteFilterQueryFromControls();
    resetVisibleLimit('models');
    void (hasActiveModelFilters() ? ensureGatewayDataLoaded('models') : Promise.resolve()).then(result => { if (result !== null) applyModelFilters(); });
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
    else applyModelFilters({ track: false });
    syncSiteFilterQueryFromControls();
    if (changed) trackGatewayEvent('tab-change', { scope: 'gateway', tab: tabName });
  }

  async function loadMore(type) {
    const state = gatewayLists[type];
    if (!state) return;
    const loadedCount = await ensureGatewayDataLoaded(type, gatewayHome.querySelector(`[data-gateway-load-more="${type}"]`));
    if (loadedCount === null) return;
    state.visibleLimit += state.pageSize;
    if (type === 'sites') applySiteFilters({ track: false });
    else applyModelFilters({ track: false });
    trackGatewayEvent('button-click', { scope: 'gateway', action: 'load-more', tab: type, loadedCount });
  }


  function updateSortButtons(state) {
    const table = gatewayHome.querySelector(state.listSelector)?.closest('[data-table]');
    syncTableSortHeaders(table, state.sort);
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
    if (await ensureGatewayDataLoaded(type) === null) return;
    state.sort = nextTableSort(state.sort, button);
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
    applySiteFilterChange();
  });
  Object.values(filterGroups).forEach(group => group.addEventListener('change', applySiteFilterChange));
  siteFavoritesInput?.addEventListener('change', applySiteFilterChange);
  modelFilterGroups.forEach(group => group.addEventListener('change', applyModelFilterChange));
  bindProviderSelection('gateway-models', provider => {
    const input = [...modelProviderGroup.querySelectorAll('input')].find(input => input.value === provider);
    if (input) { input.checked = true; applyModelFilterChange(); }
  });
  bindFamilySelection('gateway-sites', family => {
    const input = [...filterGroups.family.querySelectorAll('input')].find(input => input.value === family);
    if (input) { input.checked = true; applySiteFilterChange(); }
  });
  bindFamilySelection('gateway-models', family => {
    const input = [...modelFamilyGroup.querySelectorAll('input')].find(input => input.value === family);
    if (input) { input.checked = true; applyModelFilterChange(); }
  });
  gatewayHome.querySelector('#gatewayModelFilters')?.addEventListener('filter-clear', () => { modelFilterGroups.forEach(group => group.querySelectorAll('input').forEach(input => { input.checked = false; })); applyModelFilterChange(); });
  gatewayHome.querySelector('#gatewaySiteFilters')?.addEventListener('filter-clear', () => {
    Object.values(filterGroups).forEach(group => group.querySelectorAll('input').forEach(input => { input.checked = false; }));
    siteFavoritesInput.checked = false;
    applySiteFilterChange();
  });
  modelSearchInput?.addEventListener('input', () => {
    applyModelFilterChange();
  });
  gatewayHome.querySelectorAll('[data-gateway-load-more]').forEach(button => {
    button.addEventListener('click', () => loadMore(button.dataset.gatewayLoadMore || 'sites'));
  });
  gatewayHome.querySelectorAll('[data-table]').forEach(table => {
    table.addEventListener('click', handleGatewaySort, { capture: true });
  });
  syncSiteFilterControlsFromQuery();
  showTab(new URLSearchParams(window.location.search).get('tab') === 'models' ? 'models' : 'sites');
  void applySharedFiltersWithDeferred({ track: false, resetLimit: true });
  window.addEventListener('popstate', () => {
    syncSiteFilterControlsFromQuery();
    showTab(new URLSearchParams(window.location.search).get('tab') === 'models' ? 'models' : 'sites');
    void applySharedFiltersWithDeferred({ track: false, resetLimit: true });
  });
})();
