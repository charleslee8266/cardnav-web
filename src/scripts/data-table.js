/*
文件说明: 负责公开 DataTable 的排序、表头状态同步和渐进加载交互。
*/
const dataTables = new WeakMap();
const tablePagination = new WeakMap();

function tableRows(table) {
  return Array.from(table.querySelectorAll('tbody tr'));
}

function ensureOriginalOrder(table) {
  tableRows(table).forEach((row, index) => {
    if (!row.dataset.originalOrder) row.dataset.originalOrder = String(index);
  });
}

function rowValue(row, key, type) {
  const value = row.dataset[`sort${key.charAt(0).toUpperCase()}${key.slice(1)}`] ?? '';
  if (type === 'number') {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : Number.NEGATIVE_INFINITY;
  }
  return value;
}

function stickySortKey(table) {
  return table.dataset.tableStickyKey || '';
}

function compareStickyRows(table, leftRow, rightRow) {
  const key = stickySortKey(table);
  if (!key) return 0;
  const leftSticky = rowValue(leftRow, key, 'number');
  const rightSticky = rowValue(rightRow, key, 'number');
  if (leftSticky === rightSticky) return 0;
  return rightSticky - leftSticky;
}

function syncDataTableHeaders(table, currentSort = null) {
  table.querySelectorAll('.data-table-sort-button').forEach(button => {
    const active = currentSort?.key === button.dataset.sortKey;
    const headerCell = button.closest('th');
    if (headerCell) {
      headerCell.setAttribute('aria-sort', active ? (currentSort.direction === 'asc' ? 'ascending' : 'descending') : 'none');
      headerCell.dataset.sortDirection = active ? currentSort.direction : '';
    }
    button.dataset.sortDirection = active ? currentSort.direction : '';
    const indicator = headerCell?.querySelector('.data-table-sort-indicator') || button.querySelector('.data-table-sort-indicator');
    if (indicator) indicator.dataset.sortDirection = active ? currentSort.direction : '';
  });
}

function updateSortButtons(table) {
  syncDataTableHeaders(table, dataTables.get(table) ?? null);
}

function loadMoreSection(table) {
  const scrollWrap = table.parentElement;
  const frame = scrollWrap?.parentElement;
  const section = frame?.querySelector(':scope > [data-table-load-more]');
  return section instanceof HTMLElement && section.matches('[data-table-load-more]') ? section : null;
}

function summaryText(table, renderedCount, totalCount) {
  const template = table.dataset.tableSummaryTemplate || 'Showing {rendered} / {total}';
  return template
    .replace('{rendered}', String(renderedCount))
    .replace('{total}', String(totalCount));
}

function applyPagination(table) {
  const state = tablePagination.get(table);
  if (!state) return;
  const rows = tableRows(table);
  const renderedCount = Math.min(state.visibleCount, rows.length);
  const totalCount = Number(table.dataset.tableTotalCount) || rows.length;
  rows.forEach((row, index) => {
    row.classList.toggle('hidden', index >= state.visibleCount);
  });
  if (state.footer) {
    const hasRows = rows.length > 0;
    const button = state.footer.querySelector('button');
    const summary = state.footer.querySelector('[data-table-summary]');
    state.footer.classList.toggle('hidden', !hasRows);
    button?.classList.toggle('hidden', rows.length <= state.visibleCount);
    if (summary instanceof HTMLElement) {
      summary.classList.toggle('hidden', !hasRows);
      summary.textContent = summaryText(table, renderedCount, totalCount);
    }
  }
}

function attachPagination(table) {
  const pageSize = Number(table.dataset.tablePageSize) || 0;
  if (pageSize <= 0 || tablePagination.has(table)) return;
  const footer = loadMoreSection(table);
  const button = footer?.querySelector('button');
  const state = {
    pageSize,
    visibleCount: pageSize,
    footer,
  };
  tablePagination.set(table, state);
  if (button instanceof HTMLButtonElement) {
    button.addEventListener('click', () => {
      state.visibleCount += state.pageSize;
      applyPagination(table);
    });
  }
  applyPagination(table);
}

function sortTable(table, nextSort) {
  const tbody = table.querySelector('tbody');
  if (!tbody) return;
  ensureOriginalOrder(table);
  if (nextSort !== undefined) dataTables.set(table, nextSort);
  const currentSort = dataTables.get(table) ?? null;
  if (!currentSort) {
    tableRows(table)
      .map((row, index) => ({ row, index }))
      .sort((left, right) => {
        const stickyCompared = compareStickyRows(table, left.row, right.row);
        if (stickyCompared !== 0) return stickyCompared;
        const leftOrder = Number(left.row.dataset.originalOrder);
        const rightOrder = Number(right.row.dataset.originalOrder);
        if (Number.isFinite(leftOrder) && Number.isFinite(rightOrder) && leftOrder !== rightOrder) return leftOrder - rightOrder;
        return left.index - right.index;
      })
      .forEach(({ row }) => tbody.append(row));
    updateSortButtons(table);
    applyPagination(table);
    return;
  }

  const multiplier = currentSort.direction === 'asc' ? 1 : -1;
  const rows = tableRows(table).map((row, index) => ({ row, index }));
  rows.sort((left, right) => {
    const stickyCompared = compareStickyRows(table, left.row, right.row);
    if (stickyCompared !== 0) return stickyCompared;
    const leftValue = rowValue(left.row, currentSort.key, currentSort.type);
    const rightValue = rowValue(right.row, currentSort.key, currentSort.type);
    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      if (leftValue !== rightValue) return (leftValue - rightValue) * multiplier;
      return left.index - right.index;
    }
    const compared = String(leftValue).localeCompare(String(rightValue), 'zh-Hans-CN', { numeric: true });
    return compared === 0 ? left.index - right.index : compared * multiplier;
  });
  rows.forEach(({ row }) => tbody.append(row));
  updateSortButtons(table);
  applyPagination(table);
}

function attachDataTable(table) {
  if (!(table instanceof HTMLElement) || dataTables.has(table)) return;
  dataTables.set(table, null);
  table.querySelectorAll('.data-table-sort-button').forEach(button => {
    button.addEventListener('click', () => {
      const key = button.dataset.sortKey || '';
      if (!key) return;
      const currentSort = dataTables.get(table) ?? null;
      const currentDirection = currentSort?.key === key ? currentSort.direction : null;
      const direction = currentDirection === 'asc' ? 'desc' : (currentDirection === 'desc' ? null : 'asc');
      sortTable(table, direction ? {
        key,
        direction,
        type: button.dataset.sortType || 'text',
      } : null);
    });
  });
  table.querySelectorAll('.data-table-head-cell-sortable').forEach(headerCell => {
    headerCell.addEventListener('click', event => {
      if (event.target instanceof Element && event.target.closest('[data-inline-help]')) return;
      const button = headerCell.querySelector('.data-table-sort-button');
      if (!(button instanceof HTMLElement) || event.target === button || button.contains(event.target)) return;
      button.click();
    });
  });
  ensureOriginalOrder(table);
  attachPagination(table);
  updateSortButtons(table);
}

function initDataTables(root = document) {
  root.querySelectorAll('[data-table]').forEach(attachDataTable);
}

window.applyDataTableSort = table => {
  if (table instanceof HTMLElement) sortTable(table);
};

window.updateDataTableHeaders = (table, currentSort = null) => {
  if (table instanceof HTMLElement) syncDataTableHeaders(table, currentSort);
};

window.initDataTables = initDataTables;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initDataTables());
} else {
  initDataTables();
}
