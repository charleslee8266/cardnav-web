import pg from 'pg';

export type PublicSiteRow = {
  id: string;
  name: string;
  latestProductRefreshedAt: string | null;
  latestProductRefreshTime: string;
  score: number;
};

export type PublicProductRow = {
  categoryName: string;
  name: string;
  price: string;
  productUrl?: string;
  stock?: number;
  inStock: boolean;
  siteId: string;
  siteName: string;
  score: number;
};

export type PublicDashboardRow = {
  site: PublicSiteRow;
  products: PublicProductRow[];
  refreshedAt: null;
};

export type SearchTermSource = 'query' | 'tag' | 'empty';

export type PopularSearchTermsSnapshot = {
  terms: string[];
  normalizedTerms: string[];
};

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const pool = new pg.Pool({ connectionString });
const presetPopularSearchTerms = ['ChatGPT Plus', 'Claude', 'Gemini', 'Cursor', 'Codex', 'Team', '接码', '成品号', '共享号', 'API'];

export function formatBeijingRefreshTime(input: string | null | undefined): string {
  if (!input) return '';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day} ${lookup.hour}:${lookup.minute}:${lookup.second}`;
}

export async function loadDashboardData() {
  const sitesResult = await pool.query(`
    SELECT
      id,
      name,
      score,
      latest_product_refreshed_at
    FROM sites
    WHERE type = 'cardShop'
    ORDER BY score DESC, product_count DESC, in_stock_product_count DESC, latest_product_refreshed_at DESC NULLS LAST, id ASC
  `);

  const productsResult = await pool.query(`
    SELECT
      products.site_id,
      sites.name AS site_name,
      products.category_name,
      products.name,
      products.price,
      products.product_url,
      products.stock,
      products.in_stock,
      products.score,
      products.refreshed_at
    FROM products
    INNER JOIN sites ON sites.id = products.site_id
    WHERE sites.type = 'cardShop'
    ORDER BY sites.score DESC, products.score DESC, products.in_stock DESC, products.refreshed_at DESC, products.category_name ASC, products.name ASC
  `);

  const productsBySiteId = new Map();
  for (const row of productsResult.rows) {
    const siteId = String(row.site_id);
    const products = productsBySiteId.get(siteId) ?? [];
    products.push({
      categoryName: String(row.category_name),
      name: String(row.name),
      price: String(row.price),
      ...(row.product_url ? { productUrl: String(row.product_url) } : {}),
      ...(typeof row.stock === 'number' ? { stock: row.stock } : {}),
      inStock: Boolean(row.in_stock),
      siteId,
      siteName: String(row.site_name),
      score: Number(row.score) || 0,
    });
    productsBySiteId.set(siteId, products);
  }

  const rows: PublicDashboardRow[] = sitesResult.rows.map(row => {
    const siteId = String(row.id);
    return {
      site: {
        id: siteId,
        name: String(row.name),
        latestProductRefreshedAt: row.latest_product_refreshed_at ? String(row.latest_product_refreshed_at) : null,
        latestProductRefreshTime: formatBeijingRefreshTime(row.latest_product_refreshed_at ? String(row.latest_product_refreshed_at) : null),
        score: Number(row.score) || 0,
      },
      products: productsBySiteId.get(siteId) ?? [],
      refreshedAt: null,
    };
  });

  const latestRefreshedAt = rows.reduce<string | null>((latest, row) => {
    if (!row.site.latestProductRefreshedAt) return latest;
    if (!latest) return row.site.latestProductRefreshedAt;
    return new Date(row.site.latestProductRefreshedAt).getTime() > new Date(latest).getTime()
      ? row.site.latestProductRefreshedAt
      : latest;
  }, null);

  return {
    rows,
    totalSiteCount: rows.length,
    totalProductCount: rows.reduce((total, row) => total + row.products.length, 0),
    latestRefreshTime: formatBeijingRefreshTime(latestRefreshedAt),
  };
}

export function normalizeSearchText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function submitSiteUrl(input: string) {
  let url: string;
  try {
    const parsed = new URL(input.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false as const, message: '请输入有效的 URL' };
    }
    parsed.hash = '';
    url = parsed.toString().replace(/\/+$/, '');
  } catch {
    return { ok: false as const, message: '请输入有效的 URL' };
  }

  const result = await pool.query(
    `
      INSERT INTO urls (url, status, sub_status, notes)
      VALUES ($1, 'accepted', NULL, NULL)
      ON CONFLICT (url) DO NOTHING
      RETURNING url
    `,
    [url],
  );
  if (result.rows.length === 0) {
    return { ok: false as const, message: '当前已经有了，请勿重复提交' };
  }
  return { ok: true as const, url };
}

export async function recordSearchTerm(term: string, source: SearchTermSource) {
  const normalized = normalizeSearchText(term);
  if (!normalized || normalized.length < 2) return { recorded: false };
  if (/^https?:\/\//i.test(normalized) || /\/shop\//i.test(normalized) || /[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(normalized)) {
    return { recorded: false };
  }

  await pool.query(
    `
      INSERT INTO search_terms (term, source, total_count, empty_count, last_seen_at)
      VALUES ($1, $2, 1, $3, now())
      ON CONFLICT (term, source) DO UPDATE SET
        total_count = search_terms.total_count + 1,
        empty_count = search_terms.empty_count + EXCLUDED.empty_count,
        last_seen_at = now()
    `,
    [normalized, source, source === 'empty' ? 1 : 0],
  );
  return { recorded: true };
}

export async function loadPopularSearchTerms(limit = 10) {
  const safeLimit = Math.max(1, Math.min(30, Math.floor(limit)));
  const runtimeResult = await pool.query(
    `
      WITH candidates AS (
        SELECT term, SUM(total_count)::INTEGER AS total_count, MAX(last_seen_at) AS last_seen_at
        FROM search_terms
        WHERE source IN ('query', 'tag')
        GROUP BY term
        HAVING SUM(total_count) > 0
      )
      SELECT
        candidates.term,
        candidates.total_count,
        candidates.last_seen_at,
        COUNT(products.*)::INTEGER AS product_count
      FROM candidates
      INNER JOIN products ON lower(products.category_name || ' ' || products.name) LIKE '%' || candidates.term || '%'
      INNER JOIN sites ON sites.id = products.site_id AND sites.type = 'cardShop'
      GROUP BY candidates.term, candidates.total_count, candidates.last_seen_at
      HAVING COUNT(products.*) >= 2
      ORDER BY candidates.total_count DESC, product_count DESC, candidates.last_seen_at DESC, candidates.term ASC
      LIMIT $1
    `,
    [safeLimit],
  );
  const runtimeTerms = runtimeResult.rows.map(row => String(row.term));
  const seen = new Set(runtimeTerms.map(normalizeSearchText));
  const remaining = Math.max(0, safeLimit - runtimeTerms.length);
  if (remaining === 0) {
    return {
      terms: runtimeTerms,
      normalizedTerms: runtimeTerms.map(normalizeSearchText),
    };
  }

  const presetResult = await pool.query(
    `
      WITH candidate_terms AS (
        SELECT DISTINCT ON (lower(trim(term))) trim(term) AS term, lower(trim(term)) AS normalized_term, ordinality
        FROM unnest($1::text[]) WITH ORDINALITY AS input_terms(term, ordinality)
        WHERE trim(term) <> ''
        ORDER BY lower(trim(term)), ordinality ASC
      )
      SELECT candidate_terms.term
      FROM candidate_terms
      INNER JOIN products ON lower(products.category_name || ' ' || products.name) LIKE '%' || candidate_terms.normalized_term || '%'
      INNER JOIN sites ON sites.id = products.site_id AND sites.type = 'cardShop'
      GROUP BY candidate_terms.term, candidate_terms.ordinality
      HAVING COUNT(products.*) > 0
      ORDER BY candidate_terms.ordinality ASC
      LIMIT $2
    `,
    [presetPopularSearchTerms, remaining],
  );
  const mergedTerms = runtimeTerms.slice();
  for (const row of presetResult.rows) {
    const term = String(row.term);
    const normalized = normalizeSearchText(term);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    mergedTerms.push(term);
  }
  return {
    terms: mergedTerms.slice(0, safeLimit),
    normalizedTerms: mergedTerms.slice(0, safeLimit).map(normalizeSearchText),
  };
}
