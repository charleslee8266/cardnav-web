import { MAX_PINNED_ROWS_PER_SITE, MAX_PINNED_COMMERCIAL } from './list-ranking-policy.js';

/** Shared pin allocation. Limits apply to pins; every remaining row keeps its input order. */
export type PinKind = 'partner' | 'support' | 'favorite' | '';

type PinSite = { id?: string; sponsor?: boolean; supportPoints?: number };

export function pinListRows<Row>(rows: Row[], options: {
  manualSort?: boolean;
  defaultOrder?: (a: Row, b: Row) => number;
  site: (row: Row) => PinSite;
  favorites?: (remaining: Row[]) => Row[];
  onPin?: (row: Row, kind: PinKind) => void;
}): Row[] {
  type Merchant = { site: PinSite; best: Row; representatives: Row[] };
  const merchants = new Map<string | Row, Merchant>();
  for (const row of rows) {
    const site = options.site(row);
    if (!site.sponsor && !(Number(site.supportPoints) > 0)) continue;
    const key = site.id ?? row;
    const merchant = merchants.get(key);
    if (!merchant) {
      merchants.set(key, { site, best: row, representatives: [row] });
    } else {
      if ((options.defaultOrder?.(row, merchant.best) ?? 0) < 0) merchant.best = row;
      if (merchant.representatives.length < MAX_PINNED_ROWS_PER_SITE) merchant.representatives.push(row);
    }
  }
  const rankedSites = [...merchants.values()].sort((a, b) => Number(Boolean(b.site.sponsor)) - Number(Boolean(a.site.sponsor))
    || (b.site.supportPoints ?? 0) - (a.site.supportPoints ?? 0)
    || (options.defaultOrder?.(a.best, b.best) ?? 0)).slice(0, MAX_PINNED_COMMERCIAL);
  // Each round covers partners then supporters before any merchant receives its next row.
  const selected = new Map<Row, PinSite>();
  for (let round = 0; round < MAX_PINNED_ROWS_PER_SITE; round++) {
    for (const merchant of rankedSites) {
      if (selected.size >= MAX_PINNED_COMMERCIAL) break;
      const row = merchant.representatives[round];
      if (row !== undefined) selected.set(row, merchant.site);
    }
  }
  const partners: Row[] = [];
  const supporters: Row[] = [];
  const remaining: Row[] = [];
  for (const row of rows) {
    const site = selected.get(row);
    if (site) (site.sponsor ? partners : supporters).push(row);
    else remaining.push(row);
  }
  if (!options.manualSort) {
    const byPoints = (a: Row, b: Row) => (selected.get(b)?.supportPoints ?? 0) - (selected.get(a)?.supportPoints ?? 0)
      || (options.defaultOrder?.(a, b) ?? 0);
    partners.sort(byPoints);
    supporters.sort(byPoints);
  }
  const favorites = options.manualSort ? [] : options.favorites?.(remaining) ?? [];
  const favoriteSet = new Set(favorites);
  const regular = remaining.filter(row => !favoriteSet.has(row));
  partners.forEach(row => options.onPin?.(row, 'partner'));
  supporters.forEach(row => options.onPin?.(row, 'support'));
  favorites.forEach(row => options.onPin?.(row, 'favorite'));
  regular.forEach(row => options.onPin?.(row, ''));
  return [...partners, ...supporters, ...favorites, ...regular];
}
