/** Every column cycles through descending, ascending, then the server's default order. */
export function nextSortDirection(current: 'asc' | 'desc' | null): 'asc' | 'desc' | null {
  return current === 'desc' ? 'asc' : current === 'asc' ? null : 'desc';
}

export type TableSort = { key: string; direction: 'asc' | 'desc'; type: string };

export function nextTableSort(current: TableSort | null, control: { dataset: { sortKey?: string; sortType?: string } }): TableSort | null {
  const key = control.dataset.sortKey || '';
  if (!key) return null;
  const direction = nextSortDirection(current?.key === key ? current.direction : null);
  return direction ? { key, direction, type: control.dataset.sortType || 'text' } : null;
}
