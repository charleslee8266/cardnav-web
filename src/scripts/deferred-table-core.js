import { syncTableSortHeaders } from './table-sort-headers.js';
import { createListLoading } from './list-loading.js';
import { nextTableSort } from '../table-sort.js';
import { setTableRowSequence } from './table-sequence.js';
/*
 * 文件说明: 提供公开数据表的远端补齐、渐进渲染、排序状态和加载更多 summary 通用控制器。
 */
import { pinSiteRows } from '../site-list-pinning.js';

function defaultItems(payload) {
  if (!Array.isArray(payload?.items)) throw new Error('Invalid list response');
  return payload.items;
}

function defaultTotalCount(payload, state) {
  const totalCount = Number(payload?.totalCount);
  return Number.isFinite(totalCount) && totalCount >= 0 ? totalCount : state.totalCount;
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

export function createDeferredTableController(options) {
  const state = {
    pageSize: Number(options.pageSize) || 100,
    visibleLimit: Number(options.visibleLimit || options.pageSize) || 100,
    totalCount: Number(options.totalCount) || 0,
    apiUrl: options.apiUrl || '',
    loaded: false,
    promise: null,
    sort: null,
    entries: [],
  };
  const tbody = options.tbody;
  const table = options.table;
  const button = options.button;
  const loading = createListLoading(table.closest('.data-table-frame') || table.parentElement);
  const summary = options.summary;
  const getItems = options.getItems || defaultItems;
  const getTotalCount = options.getTotalCount || defaultTotalCount;

  function currentEntries() {
    const entries = options.filterEntry ? state.entries.filter(options.filterEntry) : state.entries.slice();
    if (state.sort) entries.sort(compareEntries(state.sort));
    return pinSiteRows(entries.map(entry => ({ entry, defaultIndex: entry.index, sponsor: Number(entry.sort.sticky) > 0, supportTotalCents: 0, supportPoints: Number(entry.sort.support) || 0, favorite: Number(entry.sort.favorite) > 0 })), (row, kind) => { row.entry.pinKind = kind; }, Boolean(state.sort)).map(row => row.entry);
  }

  let renderedEntries = null;
  let renderedCount = 0;

  function updateSummary(entries = currentEntries()) {
    if (!(summary instanceof HTMLElement)) return;
    const filteredCount = entries.length;
    const renderedCount = Math.min(state.visibleLimit, filteredCount);
    const totalCount = options.isFilterActive?.() ? filteredCount : Math.max(state.totalCount, state.entries.length);
    const template = options.summaryTemplate || 'Showing {rendered} / {total}';
    summary.textContent = template
      .replace('{rendered}', String(renderedCount))
      .replace('{total}', String(totalCount));
  }

  function updateButton(entries = currentEntries()) {
    button?.classList.toggle('hidden', state.loaded && entries.length <= state.visibleLimit);
  }

  function renderRows({ reuseEntries = false } = {}) {
    const append = Boolean(reuseEntries && renderedEntries);
    const entries = append ? renderedEntries : currentEntries();
    renderedEntries = entries;
    const start = append ? renderedCount : 0;
    const limit = Math.min(state.visibleLimit, entries.length);
    const rows = entries.slice(start, limit).map((entry, offset) => {
      const index = start + offset;
      const row = options.ensureRow(entry);
      row.dataset.pinKind = entry.pinKind || '';
      setTableRowSequence(row, index + 1);
      return row;
    });
    if (append) tbody.append(...rows);
    else tbody.replaceChildren(...rows);
    renderedCount = limit;
    updateSummary(entries);
    updateButton(entries);
    syncTableSortHeaders(table, state.sort);
    options.onRender?.(state);
  }

  async function ensureLoaded(anchor = null) {
    if (state.loaded) return 0;
    if (state.promise) return state.promise;
    if (!state.apiUrl) {
      state.loaded = true;
      return 0;
    }
    button?.setAttribute('disabled', 'disabled');
    state.promise = loading.run(async () => {
      const response = await fetch(state.apiUrl, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const items = getItems(payload, state);
      if (!Array.isArray(items)) throw new Error('Invalid list response');
      state.totalCount = getTotalCount(payload, state);
      state.entries = items.map((item, index) => options.entryFromItem(item, index));
      renderedEntries = null;
      state.loaded = true;
      return items.length;
    }, { anchor });
    try {
      return await state.promise;
    } finally {
      state.promise = null;
      button?.removeAttribute('disabled');
    }
  }

  async function sortFromButton(sortButton) {
    await ensureLoaded();
    state.sort = nextTableSort(state.sort, sortButton);
    state.visibleLimit = state.pageSize;
    renderRows();
  }

  async function loadMore() {
    await ensureLoaded(button);
    state.visibleLimit += state.pageSize;
    renderRows({ reuseEntries: true });
  }

  function initialize() {
    state.entries = Array.from(tbody.querySelectorAll('tr')).map(options.entryFromRow);
    state.loaded = state.entries.length >= state.totalCount;
    renderedEntries = currentEntries();
    renderedCount = state.entries.length;
    updateSummary(renderedEntries);
    updateButton(renderedEntries);
  }

  return {
    state,
    ensureLoaded,
    renderRows,
    loadMore,
    sortFromButton,
    initialize,
    updateSummary,
    updateButton,
  };
}
