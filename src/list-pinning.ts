/** Shared pin allocation. Limits apply to pins; every remaining row keeps its input order. */
export type PinKind = 'partner' | 'support' | 'favorite' | '';

type PinLimits = {
  rows?: number;
  sites?: number;
  rowsPerSite?: number;
  adjacentBySite?: boolean;
};

type PinSite = { id?: string; sponsor?: boolean; supportPoints?: number };

function selectPins<Row>(rows: Row[], site: (row: Row) => PinSite, limits: PinLimits): Row[] {
  const siteKey = (row: Row) => site(row).id ?? row;
  const counts = new Map<string | Row, number>();
  const selected: Row[] = [];
  for (const row of rows) {
    if (selected.length >= (limits.rows ?? Infinity)) break;
    const id = siteKey(row);
    const count = counts.get(id) ?? 0;
    if (count >= (limits.rowsPerSite ?? Infinity)) continue;
    if (!counts.has(id) && counts.size >= (limits.sites ?? Infinity)) continue;
    counts.set(id, count + 1);
    selected.push(row);
  }
  if (limits.adjacentBySite) {
    const order = new Map([...counts.keys()].map((id, index) => [id, index]));
    selected.sort((a, b) => order.get(siteKey(a))! - order.get(siteKey(b))!);
  }
  return selected;
}

export function pinListRows<Row>(rows: Row[], options: {
  enabled?: boolean;
  site: (row: Row) => PinSite;
  partner: PinLimits;
  support: PinLimits;
  favorites?: (remaining: Row[]) => Row[];
  onPin?: (row: Row, kind: PinKind) => void;
}): Row[] {
  if (options.enabled === false) {
    rows.forEach(row => options.onPin?.(row, ''));
    return rows;
  }
  const byPoints = (a: Row, b: Row) => (options.site(b).supportPoints ?? 0) - (options.site(a).supportPoints ?? 0);
  const partners = selectPins(rows.filter(row => options.site(row).sponsor).sort(byPoints), options.site, options.partner);
  const supporters = selectPins(rows.filter(row => !options.site(row).sponsor && (options.site(row).supportPoints ?? 0) > 0).sort(byPoints), options.site, options.support);
  const commercial = new Set([...partners, ...supporters]);
  const remaining = rows.filter(row => !commercial.has(row));
  const favorites = options.favorites?.(remaining) ?? [];
  const favoriteSet = new Set(favorites);
  const regular = remaining.filter(row => !favoriteSet.has(row));
  partners.forEach(row => options.onPin?.(row, 'partner'));
  supporters.forEach(row => options.onPin?.(row, 'support'));
  favorites.forEach(row => options.onPin?.(row, 'favorite'));
  regular.forEach(row => options.onPin?.(row, ''));
  return [...partners, ...supporters, ...favorites, ...regular];
}
