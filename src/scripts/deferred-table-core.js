/*
 * 文件说明: 提供公开数据表的远端补齐、渐进渲染、排序状态和加载更多 summary 通用控制器。
 */

(() => {
  function defaultItems(payload) {
    return Array.isArray(payload?.items) ? payload.items : [];
  }

  function defaultOffset(payload, state) {
    return Number(payload?.offset) || state.entries.length;
  }

  function defaultTotalCount(payload, state) {
    const totalCount = Number(payload?.totalCount);
    return Number.isFinite(totalCount) && totalCount > 0 ? totalCount : state.totalCount;
  }

  function compareEntries(sort) {
    const multiplier = sort.direction === 'asc' ? 1 : -1;
    return (left, right) => {
      if ('sticky' in left.sort && 'sticky' in right.sort && left.sort.sticky !== right.sort.sticky) {
        return (Number(right.sort.sticky) || 0) - (Number(left.sort.sticky) || 0);
      }
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

  function nextSort(currentSort, sortButton) {
    const key = sortButton.dataset.sortKey || '';
    if (!key) return null;
    const currentDirection = currentSort?.key === key ? currentSort.direction : null;
    const direction = currentDirection === 'asc' ? 'desc' : (currentDirection === 'desc' ? null : 'asc');
    return direction ? { key, direction, type: sortButton.dataset.sortType || 'text' } : null;
  }

  function createDeferredTableController(options) {
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
    const summary = options.summary;
    const getItems = options.getItems || defaultItems;
    const getOffset = options.getOffset || defaultOffset;
    const getTotalCount = options.getTotalCount || defaultTotalCount;

    function currentEntries() {
      const entries = state.entries.slice();
      if (state.sort) entries.sort(compareEntries(state.sort));
      else entries.sort((left, right) => left.index - right.index);
      return entries;
    }

    function updateSummary() {
      if (!(summary instanceof HTMLElement)) return;
      const renderedCount = Math.min(state.visibleLimit, state.entries.length);
      const totalCount = Math.max(state.totalCount, state.entries.length);
      const template = options.summaryTemplate || 'Showing {rendered} / {total}';
      summary.textContent = template
        .replace('{rendered}', String(renderedCount))
        .replace('{total}', String(totalCount));
    }

    function updateButton() {
      button?.classList.toggle('hidden', state.loaded && state.entries.length <= state.visibleLimit);
    }

    function renderRows() {
      tbody.replaceChildren(...currentEntries().slice(0, state.visibleLimit).map(options.ensureRow));
      updateSummary();
      updateButton();
      window.updateDataTableHeaders?.(table, state.sort);
      options.onRender?.(state);
    }

    async function ensureLoaded() {
      if (state.loaded) return 0;
      if (state.promise) return state.promise;
      if (!state.apiUrl) {
        state.loaded = true;
        return 0;
      }
      button?.setAttribute('disabled', 'disabled');
      state.promise = (async () => {
        const response = await fetch(state.apiUrl, { headers: { accept: 'application/json' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const items = getItems(payload, state);
        const offset = getOffset(payload, state);
        state.totalCount = getTotalCount(payload, state);
        state.entries.push(...items.map((item, index) => options.entryFromItem(item, offset + index)));
        state.loaded = true;
        return items.length;
      })();
      try {
        return await state.promise;
      } finally {
        state.promise = null;
        button?.removeAttribute('disabled');
      }
    }

    async function sortFromButton(sortButton) {
      await ensureLoaded();
      state.sort = nextSort(state.sort, sortButton);
      state.visibleLimit = state.pageSize;
      renderRows();
    }

    async function loadMore() {
      await ensureLoaded();
      state.visibleLimit += state.pageSize;
      renderRows();
    }

    function initialize() {
      state.entries = Array.from(tbody.querySelectorAll('tr')).map(options.entryFromRow);
      state.loaded = state.entries.length >= state.totalCount;
      updateSummary();
      updateButton();
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

  window.createDeferredTableController = createDeferredTableController;
})();
