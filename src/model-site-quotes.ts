import { matchesPriceUnit } from './gateway-display.js';
import { pinListRows } from './list-pinning.js';
import type { PublicGatewayModelSiteRow, PublicGatewayPriceRow } from './store.js';

export type ModelSiteQuote = {
  site: PublicGatewayModelSiteRow;
  price: PublicGatewayPriceRow;
  index: number;
  name: string;
  score: number | null;
  group: string;
  unit: string;
  pinKind: 'partner' | 'support' | '';
};

export const MODEL_SITE_MIN_SCORE_OPTIONS = [20, 40, 60, 80, 90] as const;

/** Select quotes after filtering and ordering, then allocate pin slots per site. */
export function selectModelSiteQuotes(sites: PublicGatewayModelSiteRow[], options: {
  query?: string;
  unit?: string;
  minScore?: number;
  compare?: (a: ModelSiteQuote, b: ModelSiteQuote) => number;
  unitLabel?: (price: PublicGatewayPriceRow) => string;
} = {}): ModelSiteQuote[] {
  const query = (options.query || '').trim().toLowerCase();
  const entries: ModelSiteQuote[] = sites.flatMap((site, index) => {
    if (options.minScore !== undefined && (site.siteScore === null || !Number.isFinite(site.siteScore) || site.siteScore < options.minScore)) return [];
    if (query && ![site.name, site.host, site.url].some(value => value.toLowerCase().includes(query))) return [];
    return site.pricesForModel.filter(price => matchesPriceUnit(price, options.unit || '')).map(price => ({
      site, price, index, name: site.name, score: site.siteScore, group: price.groupName, pinKind: '' as const,
      unit: options.unitLabel?.(price) || price.unit,
    }));
  });
  if (options.compare) entries.sort(options.compare);

  const groups = new Map<string, Set<string>>();
  const selected = entries.filter(({ site, price }) => {
    const seen = groups.get(site.id) || new Set<string>();
    if (seen.has(price.groupId)) return false;
    seen.add(price.groupId);
    groups.set(site.id, seen);
    return true;
  });
  return pinListRows(selected, {
    manualSort: Boolean(options.compare),
    defaultOrder: (a, b) => a.index - b.index,
    site: entry => entry.site,
    onPin: (entry, kind) => { entry.pinKind = kind === 'favorite' ? '' : kind; },
  });
}
