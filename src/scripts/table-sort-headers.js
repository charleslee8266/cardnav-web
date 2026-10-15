/**
 * Keep standard tables and grouped lists in sync with the same sort state.
 * @param {import('../table-sort.js').TableSort | null} currentSort
 */
export function syncTableSortHeaders(root, currentSort = null, labels = {}) {
  if (!root) return;
  root.querySelectorAll('.data-table-sort-button').forEach(button => {
    const active = currentSort?.key === button.dataset.sortKey;
    const direction = active ? currentSort.direction : '';
    const header = button.closest('.data-table-head-cell-sortable');
    if (header) {
      header.setAttribute('aria-sort', active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none');
      header.dataset.sortDirection = direction;
    }
    button.dataset.sortDirection = direction;
    const indicator = header?.querySelector('.data-table-sort-indicator') || button.querySelector('.data-table-sort-indicator');
    if (indicator) indicator.dataset.sortDirection = direction;
    const status = button.querySelector('.data-table-sort-status');
    if (status && labels.clickSort) {
      const directionLabel = direction === 'asc' ? labels.ascending : labels.descending;
      status.textContent = active ? labels.currentSort.replace('{direction}', directionLabel) : labels.clickSort;
    }
  });
}
