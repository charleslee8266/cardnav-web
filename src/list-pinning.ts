import { MAX_PINNED_ROWS_PER_SITE, MAX_PINNED_COMMERCIAL, MAX_PINNED_COMMERCIAL_MANUAL_SORT, MAX_SUPPORT_SITES_FOR_SECOND_PIN } from './list-ranking-policy.js';

/** Shared pin allocation. Limits apply to pins; every remaining row keeps its input order. */
export type PinKind = 'partner' | 'support' | 'favorite' | '';

type PinSite = { id?: string; sponsor?: boolean; supportPoints?: number };

export function pinListRows<Row>(rows: Row[], options: {
  manualSort?: boolean;
  defaultOrder?: (a: Row, b: Row) => number;
  representativeOrder?: (a: Row, b: Row) => number;
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
      if (!options.manualSort && options.representativeOrder) {
        merchant.representatives.push(row);
        merchant.representatives.sort(options.representativeOrder);
        merchant.representatives.length = Math.min(merchant.representatives.length, MAX_PINNED_ROWS_PER_SITE);
      } else if (merchant.representatives.length < MAX_PINNED_ROWS_PER_SITE) merchant.representatives.push(row);
    }
  }
  const pinLimit = options.manualSort ? MAX_PINNED_COMMERCIAL_MANUAL_SORT : MAX_PINNED_COMMERCIAL;
  const allowSupportSecondPin = options.manualSort || merchants.size <= MAX_SUPPORT_SITES_FOR_SECOND_PIN;
  const rankedSites = [...merchants.values()].sort((a, b) => Number(Boolean(b.site.sponsor)) - Number(Boolean(a.site.sponsor))
    || (b.site.supportPoints ?? 0) - (a.site.supportPoints ?? 0)
    || (options.defaultOrder?.(a.best, b.best) ?? 0)).slice(0, pinLimit);
  // Each round covers partners then supporters before any merchant receives its next row.
  const selected = new Map<Row, PinSite>();
  for (let round = 0; round < MAX_PINNED_ROWS_PER_SITE; round++) {
    for (const merchant of rankedSites) {
      if (selected.size >= pinLimit) break;
      if (round > 0 && !merchant.site.sponsor && !allowSupportSecondPin) continue;
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
    // Keep each merchant's existing display slots; order its selected products within those slots.
    if (options.representativeOrder) {
      for (const group of [partners, supporters]) {
        const queues = new Map<string | Row, Row[]>();
        for (const row of group) {
          const key = selected.get(row)!.id ?? row;
          const queue = queues.get(key) ?? [];
          queue.push(row);
          queues.set(key, queue);
        }
        for (const queue of queues.values()) queue.sort(options.representativeOrder);
        for (let index = 0; index < group.length; index++) {
          const row = group[index];
          group[index] = queues.get(selected.get(row)!.id ?? row)!.shift()!;
        }
      }
    }
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
