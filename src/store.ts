/**
 * 文件说明: 负责公开站点首页的数据读取、提交入库和搜索行为持久化。
 */
import 'dotenv/config';
import pg from 'pg';

export type PublicSiteRow = {
  id: string;
  name: string;
  url: string;
  lastProductRefreshSuccessAt: string | null;
  lastProductRefreshSuccessTime: string;
  score: number;
};

export type PublicGatewaySiteRow = {
  id: string;
  slug: string;
  name: string;
  url: string;
  outboundUrl: string;
  host: string;
  family: string;
  displayFamily: string;
  createdAt: string | null;
  createdTime: string;
  lastProductRefreshCompleteAt: string | null;
  lastProductRefreshCompleteTime: string;
  siteScore: number | null;
  availabilityPercent: number;
  avgSuccessLatencyMs: number | null;
  weight: number;
  summary: string;
  modelTypes: string[];
  paymentMethods: string[];
  modelCount: number;
  priceCount: number;
  modelFamilies: string[];
  displayModelFamilies: string[];
  refreshStatus: string;
  refreshErrorType: string;
  latestGatewayRefreshAt: string | null;
  latestGatewayRefreshTime: string;
};

export type PublicGatewayPriceRow = {
  modelId: string;
  unit: string;
  inputPrice: number | null;
  outputPrice: number | null;
  cacheInputPrice: number | null;
  cacheOutputPrice: number | null;
};

export type PublicGatewayModelRow = {
  id: string;
  modelId: string;
  modelFamily: string;
  supportSiteCount: number;
  priceCount: number;
  latestGatewayRefreshAt: string | null;
  latestGatewayRefreshTime: string;
};

export type PublicGatewayModelSiteRow = PublicGatewaySiteRow & {
  priceCountForModel: number;
  unitsForModel: string[];
  pricesForModel: PublicGatewayPriceRow[];
  latestModelRefreshAt: string | null;
  latestModelRefreshTime: string;
};

export type PublicGatewayDetail = {
  site: PublicGatewaySiteRow;
  prices: PublicGatewayPriceRow[];
};

export type PublicGatewayModelDetail = {
  model: PublicGatewayModelRow;
  sites: PublicGatewayModelSiteRow[];
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
  siteProductRefreshSuccessAt: string | null;
  siteProductRefreshSuccessTime: string;
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

type SubmitSiteUrlErrorKey = 'invalidUrl' | 'duplicateUrl';

let pool: pg.Pool | null = null;
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

function displayGatewayFamily(family: string) {
  if (!family || family === 'unknown' || family === 'custom' || family.startsWith('custom-')) return '';
  const labels: Record<string, string> = {
    newApi: 'New API',
    sub2Api: 'Sub2API',
    oneApi: 'One API',
    rixApi: 'Rix API',
    voApi: 'VoAPI',
    veloera: 'Veloera',
    anyRouter: 'AnyRouter',
    metapi: 'MetAPI',
  };
  return labels[family] ?? family;
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
        last_product_refresh_success_at
      FROM shop_sites
      WHERE type = 'cardShop'
      ORDER BY score DESC, product_count DESC, in_stock_product_count DESC, last_product_refresh_success_at DESC NULLS LAST, id ASC
    `)
    : null;
  const productsResult = await db.query(`
    SELECT
      shop_products.site_id,
      shop_sites.name AS site_name,
      shop_sites.url AS site_url,
      shop_sites.score AS site_score,
      shop_sites.last_product_refresh_success_at AS site_product_refresh_success_at,
      shop_products.category_name,
      shop_products.name,
      shop_products.price,
      shop_products.price_number,
      shop_products.price_unit,
      shop_products.product_url,
      shop_products.stock,
      shop_products.in_stock,
      shop_products.click_count,
      shop_products.score,
      shop_products.refreshed_at
    FROM shop_products
    INNER JOIN shop_sites ON shop_sites.id = shop_products.site_id
    WHERE shop_sites.type = 'cardShop'
    ORDER BY shop_products.score DESC, shop_sites.score DESC, shop_products.in_stock DESC, shop_products.refreshed_at DESC, shop_products.category_name ASC, shop_products.name ASC
    ${safeProductLimit ? 'LIMIT $1' : ''}
  `, safeProductLimit ? [safeProductLimit] : []);

  const products: PublicProductRow[] = productsResult.rows.map(row => {
    const refreshedAt = row.refreshed_at ? String(row.refreshed_at) : null;
    const siteProductRefreshSuccessAt = row.site_product_refresh_success_at ? String(row.site_product_refresh_success_at) : null;
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
      siteProductRefreshSuccessAt,
      siteProductRefreshSuccessTime: formatBeijingRefreshTime(siteProductRefreshSuccessAt),
      score: Number(row.score) || 0,
    };
  });

  const sites: PublicSiteRow[] = sitesResult
    ? sitesResult.rows.map(row => ({
      id: String(row.id),
      name: String(row.name),
      url: String(row.url),
      lastProductRefreshSuccessAt: row.last_product_refresh_success_at ? String(row.last_product_refresh_success_at) : null,
      lastProductRefreshSuccessTime: formatBeijingRefreshTime(row.last_product_refresh_success_at ? String(row.last_product_refresh_success_at) : null),
      score: Number(row.score) || 0,
    }))
    : (() => {
      const siteById = new Map<string, PublicSiteRow>();
      for (const row of productsResult.rows) {
        const siteId = String(row.site_id);
        if (siteById.has(siteId)) continue;
        const lastProductRefreshSuccessAt = row.site_product_refresh_success_at ? String(row.site_product_refresh_success_at) : null;
        siteById.set(siteId, {
          id: siteId,
          name: String(row.site_name),
          url: String(row.site_url),
          lastProductRefreshSuccessAt,
          lastProductRefreshSuccessTime: formatBeijingRefreshTime(lastProductRefreshSuccessAt),
          score: Number(row.site_score) || 0,
        });
      }
      return [...siteById.values()];
    })();
  const summaryResult = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE type = 'cardShop')::INTEGER AS total_site_count,
      COALESCE((
        SELECT COUNT(shop_products.*)::INTEGER
        FROM shop_products
        INNER JOIN shop_sites ON shop_sites.id = shop_products.site_id
        WHERE shop_sites.type = 'cardShop'
      ), 0) AS total_product_count,
      MAX(last_product_refresh_success_at) FILTER (WHERE type = 'cardShop') AS latest_refreshed_at
    FROM shop_sites
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

export async function loadGatewaySites() {
  const result = await getPool().query(`
    WITH price_summary AS (
      SELECT
        site_id,
        COUNT(DISTINCT model_id)::INTEGER AS model_count,
        COUNT(*)::INTEGER AS price_count,
        ARRAY_AGG(DISTINCT model_family ORDER BY model_family) FILTER (WHERE model_family <> '' AND model_family <> 'Other') AS model_families,
        MAX(fetched_at) AS latest_price_fetched_at
      FROM gateway_model_prices
      GROUP BY site_id
    )
    SELECT
      gateway_sites.site_id AS id,
      gateway_sites.name AS site_name,
      gateway_sites.url,
      gateway_sites.family,
      gateway_sites.score,
      gateway_sites.availability_percent,
      gateway_sites.avg_success_latency_ms,
      gateway_sites.created_at,
      gateway_profiles.slug,
      gateway_profiles.host,
      gateway_profiles.name AS profile_name,
      gateway_profiles.weight,
      gateway_profiles.summary,
      gateway_profiles.invite_url,
      gateway_profiles.model_types,
      gateway_profiles.payment_methods,
      COALESCE(price_summary.model_count, 0) AS model_count,
      COALESCE(price_summary.price_count, 0) AS price_count,
      COALESCE(price_summary.model_families, ARRAY[]::text[]) AS model_families,
      CASE
        WHEN cardinality(COALESCE(price_summary.model_families, ARRAY[]::text[])) > 0
          THEN price_summary.model_families
        ELSE ARRAY(
          SELECT jsonb_array_elements_text(COALESCE(gateway_profiles.model_types, '[]'::jsonb))
        )
      END AS display_model_families,
      price_summary.latest_price_fetched_at AS latest_gateway_refresh_at
    FROM gateway_sites
    INNER JOIN gateway_profiles ON gateway_profiles.url = gateway_sites.url
    LEFT JOIN price_summary ON price_summary.site_id = gateway_sites.site_id
    WHERE gateway_sites.status = 'online' AND gateway_sites.type = 'gateway'
    ORDER BY gateway_sites.score DESC, gateway_profiles.weight DESC, gateway_sites.created_at DESC NULLS LAST, gateway_sites.name ASC, gateway_sites.site_id ASC
  `);

  const sites: PublicGatewaySiteRow[] = result.rows.map(row => {
    const createdAt = row.created_at ? String(row.created_at) : null;
    const latestGatewayRefreshAt = row.latest_gateway_refresh_at ? String(row.latest_gateway_refresh_at) : null;
    const family = row.family ? String(row.family) : '';
    const url = String(row.url);
    const inviteUrl = row.invite_url ? String(row.invite_url).trim() : '';
    return {
      id: String(row.id || ''),
      slug: String(row.slug || ''),
      name: row.profile_name ? String(row.profile_name) : String(row.site_name),
      url,
      outboundUrl: inviteUrl || url,
      host: row.host ? String(row.host) : hostFromUrl(url),
      family,
      displayFamily: displayGatewayFamily(family),
      createdAt,
      createdTime: formatBeijingRefreshTime(createdAt),
      lastProductRefreshCompleteAt: null,
      lastProductRefreshCompleteTime: '',
      siteScore: Number(row.score) || 0,
      availabilityPercent: Number(row.availability_percent) || 0,
      avgSuccessLatencyMs: row.avg_success_latency_ms == null ? null : Number(row.avg_success_latency_ms),
      weight: Number(row.weight) || 0,
      summary: String(row.summary || ''),
      modelTypes: Array.isArray(row.model_types) ? row.model_types.map(String) : [],
      paymentMethods: Array.isArray(row.payment_methods) ? row.payment_methods.map(String) : [],
      modelCount: Number(row.model_count) || 0,
      priceCount: Number(row.price_count) || 0,
      modelFamilies: Array.isArray(row.model_families) ? row.model_families.map(String) : [],
      displayModelFamilies: Array.isArray(row.display_model_families) ? row.display_model_families.map(String) : [],
      refreshStatus: '',
      refreshErrorType: '',
      latestGatewayRefreshAt,
      latestGatewayRefreshTime: formatBeijingRefreshTime(latestGatewayRefreshAt),
    };
  });

  return {
    sites,
    totalSiteCount: sites.length,
    sitesWithPricesCount: sites.filter(site => site.priceCount > 0).length,
    totalModelCount: sites.reduce((sum, site) => sum + site.modelCount, 0),
    totalPriceCount: sites.reduce((sum, site) => sum + site.priceCount, 0),
  };
}

export async function loadGatewayModels() {
  const result = await getPool().query(`
    SELECT
      prices.model_id,
      COALESCE(NULLIF(prices.model_family, ''), 'Other') AS model_family,
      COUNT(DISTINCT prices.site_id)::INTEGER AS support_site_count,
      COUNT(*)::INTEGER AS price_count,
      MAX(prices.fetched_at) AS latest_gateway_refresh_at,
      MAX(gateway_sites.score) AS max_site_score
    FROM gateway_model_prices prices
    INNER JOIN gateway_sites ON gateway_sites.site_id = prices.site_id
    INNER JOIN gateway_profiles ON gateway_profiles.url = gateway_sites.url
    WHERE gateway_sites.status = 'online' AND gateway_sites.type = 'gateway'
    GROUP BY prices.model_id, COALESCE(NULLIF(prices.model_family, ''), 'Other')
    ORDER BY
      COUNT(DISTINCT prices.site_id) DESC,
      MAX(gateway_sites.score) DESC NULLS LAST,
      prices.model_id ASC
  `);

  const models: PublicGatewayModelRow[] = result.rows.map(row => {
    const modelId = String(row.model_id);
    const latestGatewayRefreshAt = row.latest_gateway_refresh_at ? String(row.latest_gateway_refresh_at) : null;
    return {
      id: modelId,
      modelId,
      modelFamily: String(row.model_family || 'Other'),
      supportSiteCount: Number(row.support_site_count) || 0,
      priceCount: Number(row.price_count) || 0,
      latestGatewayRefreshAt,
      latestGatewayRefreshTime: formatBeijingRefreshTime(latestGatewayRefreshAt),
    };
  });

  return {
    models,
    totalModelCount: models.length,
    totalSupportCount: models.reduce((sum, model) => sum + model.supportSiteCount, 0),
  };
}

export async function loadGatewayDetail(slug: string): Promise<PublicGatewayDetail | null> {
  const gatewayData = await loadGatewaySites();
  const site = gatewayData.sites.find(item => item.slug === slug);
  if (!site) return null;

  const priceResult = await getPool().query(`
    SELECT
      prices.model_id,
      prices.unit,
      prices.input_price,
      prices.output_price,
      prices.cache_input_price,
      prices.cache_output_price
    FROM gateway_model_prices prices
    WHERE prices.site_id = $1
    ORDER BY
      CASE prices.model_family
        WHEN 'GPT' THEN 1
        WHEN 'Claude' THEN 2
        WHEN 'Gemini' THEN 3
        WHEN 'Qwen' THEN 4
        WHEN 'Grok' THEN 5
        ELSE 20
      END ASC,
      prices.model_id ASC,
      prices.unit ASC
    LIMIT 80
  `, [site.id]);

  return {
    site,
    prices: priceResult.rows.map(row => ({
      modelId: String(row.model_id),
      unit: String(row.unit || ''),
      inputPrice: row.input_price == null ? null : Number(row.input_price),
      outputPrice: row.output_price == null ? null : Number(row.output_price),
      cacheInputPrice: row.cache_input_price == null ? null : Number(row.cache_input_price),
      cacheOutputPrice: row.cache_output_price == null ? null : Number(row.cache_output_price),
    })),
  };
}

export async function loadGatewayModelDetail(pathId: string): Promise<PublicGatewayModelDetail | null> {
  const modelId = pathId.trim();
  if (!modelId) return null;

  const gatewayModels = await loadGatewayModels();
  const model = gatewayModels.models.find(item => item.modelId === modelId);
  if (!model) return null;

  const result = await getPool().query(`
    WITH model_price_summary AS (
      SELECT
        site_id,
        COUNT(*)::INTEGER AS price_count_for_model,
        ARRAY_AGG(DISTINCT unit ORDER BY unit) FILTER (WHERE unit <> '') AS units_for_model,
        jsonb_agg(
          jsonb_build_object(
            'unit', unit,
            'inputPrice', input_price,
            'outputPrice', output_price,
            'cacheInputPrice', cache_input_price,
            'cacheOutputPrice', cache_output_price
          )
          ORDER BY unit ASC, input_price ASC NULLS LAST, output_price ASC NULLS LAST
        ) AS prices_for_model,
        MAX(fetched_at) AS latest_model_refresh_at
      FROM gateway_model_prices
      WHERE model_id = $1
      GROUP BY site_id
    ),
    site_price_summary AS (
      SELECT
        site_id,
        COUNT(DISTINCT model_id)::INTEGER AS model_count,
        COUNT(*)::INTEGER AS price_count,
        ARRAY_AGG(DISTINCT model_family ORDER BY model_family) FILTER (WHERE model_family <> '' AND model_family <> 'Other') AS model_families,
        MAX(fetched_at) AS latest_price_fetched_at
      FROM gateway_model_prices
      GROUP BY site_id
    )
    SELECT
      gateway_sites.site_id AS id,
      gateway_sites.name AS site_name,
      gateway_sites.url,
      gateway_sites.family,
      gateway_sites.score,
      gateway_sites.availability_percent,
      gateway_sites.avg_success_latency_ms,
      gateway_sites.created_at,
      gateway_profiles.slug,
      gateway_profiles.host,
      gateway_profiles.name AS profile_name,
      gateway_profiles.weight,
      gateway_profiles.summary,
      gateway_profiles.invite_url,
      gateway_profiles.model_types,
      gateway_profiles.payment_methods,
      COALESCE(site_price_summary.model_count, 0) AS model_count,
      COALESCE(site_price_summary.price_count, 0) AS price_count,
      COALESCE(site_price_summary.model_families, ARRAY[]::text[]) AS model_families,
      CASE
        WHEN cardinality(COALESCE(site_price_summary.model_families, ARRAY[]::text[])) > 0
          THEN site_price_summary.model_families
        ELSE ARRAY(
          SELECT jsonb_array_elements_text(COALESCE(gateway_profiles.model_types, '[]'::jsonb))
        )
      END AS display_model_families,
      site_price_summary.latest_price_fetched_at AS latest_gateway_refresh_at,
      model_price_summary.price_count_for_model,
      COALESCE(model_price_summary.units_for_model, ARRAY[]::text[]) AS units_for_model,
      COALESCE(model_price_summary.prices_for_model, '[]'::jsonb) AS prices_for_model,
      model_price_summary.latest_model_refresh_at
    FROM model_price_summary
    INNER JOIN gateway_sites ON gateway_sites.site_id = model_price_summary.site_id
    INNER JOIN gateway_profiles ON gateway_profiles.url = gateway_sites.url
    LEFT JOIN site_price_summary ON site_price_summary.site_id = gateway_sites.site_id
    WHERE gateway_sites.status = 'online' AND gateway_sites.type = 'gateway'
    ORDER BY gateway_sites.score DESC, gateway_profiles.weight DESC, gateway_sites.created_at DESC NULLS LAST, gateway_sites.name ASC
  `, [modelId]);

  return {
    model,
    sites: result.rows.map(row => {
      const createdAt = row.created_at ? String(row.created_at) : null;
      const latestGatewayRefreshAt = row.latest_gateway_refresh_at ? String(row.latest_gateway_refresh_at) : null;
      const latestModelRefreshAt = row.latest_model_refresh_at ? String(row.latest_model_refresh_at) : null;
      const family = row.family ? String(row.family) : '';
      const url = String(row.url);
      const inviteUrl = row.invite_url ? String(row.invite_url).trim() : '';
      return {
        id: String(row.id || ''),
        slug: String(row.slug || ''),
        name: row.profile_name ? String(row.profile_name) : String(row.site_name),
        url,
        outboundUrl: inviteUrl || url,
        host: row.host ? String(row.host) : hostFromUrl(url),
        family,
        displayFamily: displayGatewayFamily(family),
        createdAt,
        createdTime: formatBeijingRefreshTime(createdAt),
        lastProductRefreshCompleteAt: null,
        lastProductRefreshCompleteTime: '',
        siteScore: Number(row.score) || 0,
        availabilityPercent: Number(row.availability_percent) || 0,
        avgSuccessLatencyMs: row.avg_success_latency_ms == null ? null : Number(row.avg_success_latency_ms),
        weight: Number(row.weight) || 0,
        summary: String(row.summary || ''),
        modelTypes: Array.isArray(row.model_types) ? row.model_types.map(String) : [],
        paymentMethods: Array.isArray(row.payment_methods) ? row.payment_methods.map(String) : [],
        modelCount: Number(row.model_count) || 0,
        priceCount: Number(row.price_count) || 0,
        modelFamilies: Array.isArray(row.model_families) ? row.model_families.map(String) : [],
        displayModelFamilies: Array.isArray(row.display_model_families) ? row.display_model_families.map(String) : [],
        refreshStatus: '',
        refreshErrorType: '',
        latestGatewayRefreshAt,
        latestGatewayRefreshTime: formatBeijingRefreshTime(latestGatewayRefreshAt),
        priceCountForModel: Number(row.price_count_for_model) || 0,
        unitsForModel: Array.isArray(row.units_for_model) ? row.units_for_model.map(String) : [],
        pricesForModel: Array.isArray(row.prices_for_model) ? row.prices_for_model.map((price: any) => ({
          modelId,
          unit: String(price.unit || ''),
          inputPrice: price.inputPrice == null ? null : Number(price.inputPrice),
          outputPrice: price.outputPrice == null ? null : Number(price.outputPrice),
          cacheInputPrice: price.cacheInputPrice == null ? null : Number(price.cacheInputPrice),
          cacheOutputPrice: price.cacheOutputPrice == null ? null : Number(price.cacheOutputPrice),
        })) : [],
        latestModelRefreshAt,
        latestModelRefreshTime: formatBeijingRefreshTime(latestModelRefreshAt),
      };
    }),
  };
}

function hostFromUrl(input: string) {
  try {
    return new URL(input).hostname;
  } catch {
    return input;
  }
}

export function normalizeSearchText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function submitSiteUrl(input: string) {
  let url: string;
  try {
    const parsed = new URL(input.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false as const, errorKey: 'invalidUrl' satisfies SubmitSiteUrlErrorKey };
    }
    parsed.hash = '';
    url = parsed.toString().replace(/\/+$/, '');
  } catch {
    return { ok: false as const, errorKey: 'invalidUrl' satisfies SubmitSiteUrlErrorKey };
  }

  const result = await getPool().query(
    `
      INSERT INTO shop_sites (id, url, status, family, type)
      VALUES (md5(regexp_replace(split_part($1, '#', 1), '/$', '') || $2), $1, 'accepted', 'unknown', 'unknown')
      ON CONFLICT (url) DO NOTHING
      RETURNING url
    `,
    [url, '2164802aa948726ee717662bcc17f7295e278340d9dcf4f0'],
  );
  if (result.rows.length === 0) {
    return { ok: false as const, errorKey: 'duplicateUrl' satisfies SubmitSiteUrlErrorKey };
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
      INSERT INTO shop_search_terms (term, total_count, result_count, last_seen_at)
      VALUES ($1, 1, $2, now())
      ON CONFLICT (term) DO UPDATE SET
        total_count = shop_search_terms.total_count + 1,
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
      UPDATE shop_products
      SET click_count = click_count + 1
      WHERE ctid IN (
        SELECT ctid
        FROM shop_products
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

export async function loadPopularSearchTerms(limit = 10, presetPopularSearchTerms: string[] = []) {
  const safeLimit = Math.max(1, Math.min(30, Math.floor(limit)));
  const db = getPool();
  const runtimeResult = await db.query(
    `
      SELECT
        shop_search_terms.term,
        shop_search_terms.total_count,
        shop_search_terms.last_seen_at
      FROM shop_search_terms
      WHERE shop_search_terms.total_count > 0
        AND shop_search_terms.result_count > 0
      ORDER BY shop_search_terms.total_count DESC, shop_search_terms.result_count DESC, shop_search_terms.last_seen_at DESC, shop_search_terms.term ASC
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
      INNER JOIN shop_products ON lower(shop_products.category_name || ' ' || shop_products.name) LIKE '%' || candidate_terms.normalized_term || '%'
      INNER JOIN shop_sites ON shop_sites.id = shop_products.site_id AND shop_sites.type = 'cardShop'
      GROUP BY candidate_terms.term, candidate_terms.ordinality
      HAVING COUNT(shop_products.*) > 0
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
  appName: string;
  planName: string;
  displayName: string;
  urlSlug: string;
  isDefault: boolean;
  displayOrder: number;
  countryCode: string;
  countryLabel: string;
  currencyCode: string;
  priceText: string;
  priceValue: number;
  cnyPrice: number;
  usdPrice: number;
  rubPrice: number;
  fetchedAt: string;
};

export type PublicModelLeaderboardRow = {
  taskSlug: string;
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
    SELECT app_slug, plan_slug, app_name, plan_name, display_name, url_slug, is_default, display_order, country_code, country_label, currency_code, price_text, price_value, cny_price, usd_price, rub_price, fetched_at
    FROM official_prices
    ORDER BY display_order ASC, cny_price ASC
  `);
  return result.rows.map(row => ({
    appSlug: String(row.app_slug),
    planSlug: String(row.plan_slug),
    appName: String(row.app_name),
    planName: String(row.plan_name),
    displayName: String(row.display_name),
    urlSlug: String(row.url_slug),
    isDefault: Boolean(row.is_default),
    displayOrder: Number(row.display_order) || 0,
    countryCode: String(row.country_code),
    countryLabel: String(row.country_label),
    currencyCode: String(row.currency_code),
    priceText: String(row.price_text),
    priceValue: Number(row.price_value),
    cnyPrice: Number(row.cny_price),
    usdPrice: Number(row.usd_price),
    rubPrice: Number(row.rub_price),
    fetchedAt: String(row.fetched_at),
  }));
}

export async function loadModelLeaderboards(): Promise<PublicModelLeaderboardRow[]> {
  const db = getPool();
  const result = await db.query(`
    SELECT
      task_slug,
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
