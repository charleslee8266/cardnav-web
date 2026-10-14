import { comparePriceUnits, matchesPriceUnit } from './gateway-display.js';
import { MAX_MODEL_QUOTE_GROUPS_PER_SITE } from './list-ranking-policy.js';
import { pinSiteRows } from './site-list-pinning.js';
import type { PublicGatewayModelSiteRow, PublicGatewayPriceRow } from './store.js';

export type ModelSiteQuote = {
  site: PublicGatewayModelSiteRow;
  price: PublicGatewayPriceRow;
  index: number;
  name: string;
  group: string;
  unit: string;
  pinKind: 'partner' | 'support' | '';
};

/** Select quotes after filtering and ordering, then allocate pin slots per site. */
export function selectModelSiteQuotes(sites: PublicGatewayModelSiteRow[], options: {
  query?: string;
  unit?: string;
  compare?: (a: ModelSiteQuote, b: ModelSiteQuote) => number;
  unitLabel?: (price: PublicGatewayPriceRow) => string;
} = {}): ModelSiteQuote[] {
  const query = (options.query || '').trim().toLowerCase();
  const entries: ModelSiteQuote[] = sites.flatMap((site, index) => {
    if (query && ![site.name, site.host, site.url].some(value => value.toLowerCase().includes(query))) return [];
    return site.pricesForModel.filter(price => matchesPriceUnit(price, options.unit || '')).map(price => ({
      site, price, index, name: site.name, group: price.groupName, pinKind: '' as const,
      unit: options.unitLabel?.(price) || price.unit,
    }));
  });
  entries.sort(options.compare || ((a, b) => comparePriceUnits(a.price, b.price)
    || (a.price.inputPrice ?? Infinity) - (b.price.inputPrice ?? Infinity) || a.index - b.index));

  const groups = new Map<string, Set<string>>();
  const selected = entries.filter(({ site, price }) => {
    const seen = groups.get(site.id) || new Set<string>();
    if (seen.has(price.groupId) || seen.size >= MAX_MODEL_QUOTE_GROUPS_PER_SITE) return false;
    seen.add(price.groupId);
    groups.set(site.id, seen);
    return true;
  });
  const candidates = [...new Map(selected.map(({ site }) => [site.id, site])).values()]
    .map(site => ({ ...site, favorite: false }));
  const pinOrder = new Map<string, number>();
  const pinKinds = new Map<string, ModelSiteQuote['pinKind']>();
  pinSiteRows(candidates, (site, kind) => {
    if (kind === 'partner' || kind === 'support') {
      pinOrder.set(site.id, pinOrder.size);
      pinKinds.set(site.id, kind);
    }
  });
  selected.forEach(entry => { entry.pinKind = pinKinds.get(entry.site.id) || ''; });
  return selected.sort((a, b) => (pinOrder.get(a.site.id) ?? Infinity) - (pinOrder.get(b.site.id) ?? Infinity));
}
