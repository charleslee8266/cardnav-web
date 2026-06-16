/**
 * 文件说明: 负责公开站点首页的数据读取、提交入库和搜索行为持久化。
 * 对应文档: docs/specs/sorting-and-score.md
 */
import 'dotenv/config';
import pg from 'pg';

export type PublicSiteRow = {
  id: string;
  name: string;
  url: string;
  latestProductRefreshedAt: string | null;
  latestProductRefreshTime: string;
  score: number;
};

export type PublicProductRow = {
  categoryName: string;
  name: string;
  price: string;
  priceNumber: number | null;
  priceUnit: string | null;
  productUrl?: string;
  stock?: number;
  inStock: boolean;
  refreshedAt: string | null;
  refreshTime: string;
  siteId: string;
  siteName: string;
  siteUrl: string;
  siteLatestProductRefreshedAt: string | null;
  siteLatestProductRefreshTime: string;
  clickCount: number;
  score: number;
};

export type ProductClickInput = {
  siteId: string;
  productUrl?: string;
  categoryName?: string;
  name?: string;
};

export type PopularSearchTermsSnapshot = {
  terms: string[];
  normalizedTerms: string[];
};

let pool: pg.Pool | null = null;
const presetPopularSearchTerms = ['ChatGPT Plus', 'Claude', 'Gemini', 'Cursor', 'Codex', 'Team', '接码', '成品号', '共享号', 'API'];
const beijingDateFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  pool = new pg.Pool({ connectionString });
  return pool;
}

export function formatBeijingRefreshTime(input: string | null | undefined): string {
  if (!input) return '';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  const parts = beijingDateFormatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day} ${lookup.hour}:${lookup.minute}:${lookup.second}`;
}

export async function loadDashboardData(options: { productLimit?: number } = {}) {
  const db = getPool();
  const safeProductLimit = typeof options.productLimit === 'number' && Number.isFinite(options.productLimit)
    ? Math.max(1, Math.floor(options.productLimit))
    : null;
  const sitesResult = safeProductLimit === null
    ? await db.query(`
      SELECT
        id,
        name,
        url,
        score,
        latest_product_refreshed_at
      FROM sites
      WHERE type = 'cardShop'
      ORDER BY score DESC, product_count DESC, in_stock_product_count DESC, latest_product_refreshed_at DESC NULLS LAST, id ASC
    `)
    : null;
  const productsResult = await db.query(`
    SELECT
      products.site_id,
      sites.name AS site_name,
      sites.url AS site_url,
      sites.score AS site_score,
      sites.latest_product_refreshed_at AS site_latest_product_refreshed_at,
      products.category_name,
      products.name,
      products.price,
      products.price_number,
      products.price_unit,
      products.product_url,
      products.stock,
      products.in_stock,
      products.click_count,
      products.score,
      products.refreshed_at
    FROM products
    INNER JOIN sites ON sites.id = products.site_id
    WHERE sites.type = 'cardShop'
    ORDER BY products.score DESC, sites.score DESC, products.in_stock DESC, products.refreshed_at DESC, products.category_name ASC, products.name ASC
    ${safeProductLimit ? 'LIMIT $1' : ''}
  `, safeProductLimit ? [safeProductLimit] : []);

  const products: PublicProductRow[] = productsResult.rows.map(row => {
    const refreshedAt = row.refreshed_at ? String(row.refreshed_at) : null;
    const siteLatestProductRefreshedAt = row.site_latest_product_refreshed_at ? String(row.site_latest_product_refreshed_at) : null;
    return {
      categoryName: String(row.category_name),
      name: String(row.name),
      price: String(row.price),
      priceNumber: typeof row.price_number === 'number' ? Number(row.price_number) : null,
      priceUnit: typeof row.price_unit === 'string' ? String(row.price_unit) : null,
      ...(row.product_url ? { productUrl: String(row.product_url) } : {}),
      ...(typeof row.stock === 'number' ? { stock: row.stock } : {}),
      inStock: Boolean(row.in_stock),
      refreshedAt,
      refreshTime: formatBeijingRefreshTime(refreshedAt),
      clickCount: Number(row.click_count) || 0,
      siteId: String(row.site_id),
      siteName: String(row.site_name),
      siteUrl: String(row.site_url),
      siteLatestProductRefreshedAt,
      siteLatestProductRefreshTime: formatBeijingRefreshTime(siteLatestProductRefreshedAt),
      score: Number(row.score) || 0,
    };
  });

  const sites: PublicSiteRow[] = sitesResult
    ? sitesResult.rows.map(row => ({
      id: String(row.id),
      name: String(row.name),
      url: String(row.url),
      latestProductRefreshedAt: row.latest_product_refreshed_at ? String(row.latest_product_refreshed_at) : null,
      latestProductRefreshTime: formatBeijingRefreshTime(row.latest_product_refreshed_at ? String(row.latest_product_refreshed_at) : null),
      score: Number(row.score) || 0,
    }))
    : (() => {
      const siteById = new Map<string, PublicSiteRow>();
      for (const row of productsResult.rows) {
        const siteId = String(row.site_id);
        if (siteById.has(siteId)) continue;
        const latestProductRefreshedAt = row.site_latest_product_refreshed_at ? String(row.site_latest_product_refreshed_at) : null;
        siteById.set(siteId, {
          id: siteId,
          name: String(row.site_name),
          url: String(row.site_url),
          latestProductRefreshedAt,
          latestProductRefreshTime: formatBeijingRefreshTime(latestProductRefreshedAt),
          score: Number(row.site_score) || 0,
        });
      }
      return [...siteById.values()];
    })();
  const summaryResult = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE type = 'cardShop')::INTEGER AS total_site_count,
      COALESCE((
        SELECT COUNT(products.*)::INTEGER
        FROM products
        INNER JOIN sites ON sites.id = products.site_id
        WHERE sites.type = 'cardShop'
      ), 0) AS total_product_count,
      MAX(latest_product_refreshed_at) FILTER (WHERE type = 'cardShop') AS latest_refreshed_at
    FROM sites
  `);
  const summaryRow = summaryResult.rows[0] ?? {};
  const totalSiteCount = Number(summaryRow.total_site_count) || 0;
  const totalProductCount = Number(summaryRow.total_product_count) || 0;
  const latestRefreshedAt = summaryRow.latest_refreshed_at ? String(summaryRow.latest_refreshed_at) : null;

  return {
    sites,
    products,
    totalSiteCount,
    totalProductCount,
    latestRefreshTime: formatBeijingRefreshTime(latestRefreshedAt),
    isPartial: totalProductCount > products.length,
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

  const result = await getPool().query(
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

export async function recordSearchTerm(term: string, resultCount: number) {
  const normalized = normalizeSearchText(term);
  const safeResultCount = Number.isFinite(resultCount) ? Math.max(0, Math.floor(resultCount)) : 0;
  if (!normalized || normalized.length < 2) return { recorded: false };
  if (/^https?:\/\//i.test(normalized) || /\/shop\//i.test(normalized) || /[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(normalized)) {
    return { recorded: false };
  }

  await getPool().query(
    `
      INSERT INTO search_terms (term, total_count, result_count, last_seen_at)
      VALUES ($1, 1, $2, now())
      ON CONFLICT (term) DO UPDATE SET
        total_count = search_terms.total_count + 1,
        result_count = EXCLUDED.result_count,
        last_seen_at = now()
    `,
    [normalized, safeResultCount],
  );
  return { recorded: true };
}

export async function recordProductClick(input: ProductClickInput) {
  const siteId = input.siteId.trim();
  const productUrl = input.productUrl?.trim() ?? '';
  const categoryName = input.categoryName?.trim() ?? '';
  const name = input.name?.trim() ?? '';
  if (!siteId) return { recorded: false as const };
  if (!productUrl && (!categoryName || !name)) return { recorded: false as const };

  const result = await getPool().query(
    `
      UPDATE products
      SET click_count = click_count + 1
      WHERE ctid IN (
        SELECT ctid
        FROM products
        WHERE site_id = $1
          AND (
            ($2 <> '' AND product_url = $2)
            OR ($2 = '' AND category_name = $3 AND name = $4)
          )
        ORDER BY refreshed_at DESC, name ASC
        LIMIT 1
      )
      RETURNING site_id
    `,
    [siteId, productUrl, categoryName, name],
  );
  return { recorded: result.rows.length > 0 };
}

export async function loadPopularSearchTerms(limit = 10) {
  const safeLimit = Math.max(1, Math.min(30, Math.floor(limit)));
  const db = getPool();
  const runtimeResult = await db.query(
    `
      SELECT
        search_terms.term,
        search_terms.total_count,
        search_terms.last_seen_at
      FROM search_terms
      WHERE search_terms.total_count > 0
        AND search_terms.result_count > 0
      ORDER BY search_terms.total_count DESC, search_terms.result_count DESC, search_terms.last_seen_at DESC, search_terms.term ASC
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

  const presetResult = await db.query(
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

export type PublicOfficialPriceRow = {
  appSlug: string;
  planSlug: string;
  countryCode: string;
  countryLabel: string;
  currencyCode: string;
  priceText: string;
  priceValue: number;
  cnyPrice: number;
  fetchedAt: string;
};

export type PublicModelLeaderboardRow = {
  taskSlug: string;
  taskLabel: string;
  sourceName: string;
  sourceUrl: string;
  sourceGroupSlug: string;
  sourceBoardSlug: string;
  rank: number;
  modelName: string;
  score: number;
  fetchedAt: string;
};

export async function loadOfficialPrices(): Promise<PublicOfficialPriceRow[]> {
  const db = getPool();
  const result = await db.query(`
    SELECT app_slug, plan_slug, country_code, country_label, currency_code, price_text, price_value, cny_price, fetched_at
    FROM official_prices
    ORDER BY app_slug ASC, cny_price ASC
  `);
  return result.rows.map(row => ({
    appSlug: String(row.app_slug),
    planSlug: String(row.plan_slug),
    countryCode: String(row.country_code),
    countryLabel: String(row.country_label),
    currencyCode: String(row.currency_code),
    priceText: String(row.price_text),
    priceValue: Number(row.price_value),
    cnyPrice: Number(row.cny_price),
    fetchedAt: String(row.fetched_at),
  }));
}

export async function loadModelLeaderboards(): Promise<PublicModelLeaderboardRow[]> {
  const db = getPool();
  const result = await db.query(`
    SELECT
      task_slug,
      task_label,
      source_name,
      source_url,
      source_group_slug,
      source_board_slug,
      rank,
      model_name,
      score,
      fetched_at
    FROM model_leaderboards
    ORDER BY
      CASE task_slug
        WHEN 'coding' THEN 1
        WHEN 'creative-writing' THEN 2
        WHEN 'math' THEN 3
        WHEN 'text-to-image' THEN 4
        ELSE 999
      END ASC,
      rank ASC
  `);
  return result.rows.map(row => ({
    taskSlug: String(row.task_slug),
    taskLabel: String(row.task_label),
    sourceName: String(row.source_name),
    sourceUrl: String(row.source_url),
    sourceGroupSlug: String(row.source_group_slug),
    sourceBoardSlug: String(row.source_board_slug),
    rank: Number(row.rank),
    modelName: String(row.model_name),
    score: Number(row.score),
    fetchedAt: String(row.fetched_at),
  }));
}
