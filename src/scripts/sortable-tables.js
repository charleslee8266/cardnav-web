/*
文件说明: 负责公开 可排序数据表格的前端排序交互，复用卡网商品表的排序表头样式。
*/
const sortableTables = new WeakMap();

function sortableRows(table) {
  return Array.from(table.querySelectorAll('tbody tr'));
}

function ensureOriginalOrder(table) {
  sortableRows(table).forEach((row, index) => {
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

function updateSortButtons(table) {
  const currentSort = sortableTables.get(table) ?? null;
  table.querySelectorAll('.flat-sort-button').forEach(button => {
    const active = currentSort?.key === button.dataset.sortKey;
    const headerCell = button.closest('th');
    if (headerCell) headerCell.setAttribute('aria-sort', active ? (currentSort.direction === 'asc' ? 'ascending' : 'descending') : 'none');
    button.dataset.sortDirection = active ? currentSort.direction : '';
    const indicator = button.querySelector('.sort-indicator');
    if (indicator) indicator.dataset.sortDirection = active ? currentSort.direction : '';
  });
}

function sortTable(table, nextSort) {
  const tbody = table.querySelector('tbody');
  if (!tbody) return;
  ensureOriginalOrder(table);
  if (nextSort !== undefined) sortableTables.set(table, nextSort);
  const currentSort = sortableTables.get(table) ?? null;
  if (!currentSort) {
    sortableRows(table)
      .map((row, index) => ({ row, index }))
      .sort((left, right) => {
        const leftOrder = Number(left.row.dataset.originalOrder);
        const rightOrder = Number(right.row.dataset.originalOrder);
        if (Number.isFinite(leftOrder) && Number.isFinite(rightOrder) && leftOrder !== rightOrder) return leftOrder - rightOrder;
        return left.index - right.index;
      })
      .forEach(({ row }) => tbody.append(row));
    updateSortButtons(table);
    return;
  }

  const multiplier = currentSort.direction === 'asc' ? 1 : -1;
  const rows = sortableRows(table).map((row, index) => ({ row, index }));
  rows.sort((left, right) => {
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
}

function attachSortableTable(table) {
  if (!(table instanceof HTMLElement) || sortableTables.has(table)) return;
  sortableTables.set(table, null);
  table.querySelectorAll('.flat-sort-button').forEach(button => {
    button.addEventListener('click', () => {
      const key = button.dataset.sortKey || '';
      if (!key) return;
      const currentSort = sortableTables.get(table) ?? null;
      const currentDirection = currentSort?.key === key ? currentSort.direction : null;
      const direction = currentDirection === 'asc' ? 'desc' : (currentDirection === 'desc' ? null : 'asc');
      sortTable(table, direction ? {
        key,
        direction,
        type: button.dataset.sortType || 'text',
      } : null);
    });
  });
  table.querySelectorAll('.flat-sort-head').forEach(headerCell => {
    headerCell.addEventListener('click', event => {
      const button = headerCell.querySelector('.flat-sort-button');
      if (!(button instanceof HTMLElement) || event.target === button || button.contains(event.target)) return;
      button.click();
    });
  });
  ensureOriginalOrder(table);
  updateSortButtons(table);
}

function initSortableTables(root = document) {
  root.querySelectorAll('[data-sortable-table]').forEach(attachSortableTable);
}

window.applySortableTableSort = table => {
  if (table instanceof HTMLElement) sortTable(table);
};

window.initSortableTables = initSortableTables;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initSortableTables());
} else {
  initSortableTables();
}
