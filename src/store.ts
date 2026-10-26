/**
 * 文件说明: 负责公开站点首页的数据读取、提交入库和搜索行为持久化。
 */
import { shopPlatformName } from './shop-platform.js';
import { createFamilyNavigation } from './models/family-navigation.js';
import { officialPlanIdentity, officialPriceStorageSlugs, isRetiredOfficialPrice, autoCategoryIdsForFilter } from './models/product-catalog.js';
import 'dotenv/config';
import pg from 'pg';
import type { ShopClickEvent } from './shop-click.js';
import { MAX_PINNED_COMMERCIAL, MAX_PINNED_ROWS_PER_SITE, MAX_SUPPORT_SITES_FOR_SECOND_PIN } from './list-ranking-policy.js';
import { validatePublicSubmittedUrl, type PublicSubmittedUrlRejectReason } from './submitted-url.js';

export type PublicSiteRow = {
  slug: string;
  platformName?: string;
  id: string;
  name: string;
  url: string;
  lastProductRefreshSuccessAt: string | null;
  lastProductRefreshSuccessTime: string;
  score: number;
  sponsor: boolean;
  supportTotalCents: number;
  supportPoints?: number;
};

export type PublicGatewaySiteRow = {
  id: string;
  slug: string;
  name: string;
  url: string;
  apiEndpoint?: string;
  outboundUrl: string;
  host: string;
  family: string;
  displayFamily: string;
  domainRegisteredAt?: string | null;
  createdAt: string | null;
  createdTime: string;
  lastProductRefreshCompleteAt: string | null;
  lastProductRefreshCompleteTime: string;
  siteScore: number | null;
  sponsor: boolean;
  supportTotalCents: number;
  supportPoints?: number;
  availabilityPercent: number;
  avgSuccessLatencyMs: number | null;
  summary: string;
  modelProviders: string[];
  modelFamilies: string[];
  paymentMethods: string[];
  modelCount: number;
  priceCount: number;
  recentModelProviders: string[];
  recentModelFamilies: string[];
  displayModelProviders: string[];
  displayModelFamilies: string[];
  refreshStatus: string;
  refreshErrorType: string;
  latestGatewayRefreshAt: string | null;
  latestGatewayRefreshTime: string;
};

export type PublicGatewayPriceRow = {
  groupId: string;
  groupName: string;
  groupDescription: string;
  modelId: string;
  modelFamily: string | null;
  unit: string;
  currency: string | null;
  inputPrice: number | null;
  outputPrice: number | null;
  cacheInputPrice: number | null;
  cacheOutputPrice: number | null;
};

export type PublicGatewayModelRow = {
  id: string;
  modelId: string;
  releaseDate: string | null;
  modelFamily: string | null;
  modelProvider: string;
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
  shopRecommendation?: number;
  siteSlug: string;
  sitePlatformName?: string;
  id: string;
  categoryName: string;
  autoCategory: string;
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
  siteScore: number;
  siteSponsor: boolean;
  siteSupportTotalCents: number;
  siteSupportPoints?: number;
  score: number;
};

export type ProductClickInput = {
  siteId: string;
  visitorId: string;
  productUrl?: string;
  categoryName?: string;
  name?: string;
};

export type ProductMetricInput = {
  productId: string;
  visitorId: string;
  eventType: 'impression' | 'click';
  scene: 'default' | 'search';
  displayType: 'normal' | 'partner' | 'support' | 'favorite';
  positionBucket: '1-5' | '6-20' | '21+';
};

type SubmitSiteUrlErrorKey = PublicSubmittedUrlRejectReason | 'duplicateUrl' | 'invalidGatewayInfo' | 'gatewayInvalidUrl' | 'gatewayInvalidApiEndpoint';
type PublicListLimitOptions = {
  limit?: number;
};

function safeListLimit(limit: number | undefined) {
  return typeof limit === 'number' && Number.isFinite(limit)
    ? Math.max(1, Math.floor(limit))
    : null;
}

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

export function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  pool = new pg.Pool({
    connectionString,
    max: 12,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  return pool;
}

export async function recordGatewayEngagement(input: {
  subjectType: 'site' | 'model'; subjectId: string; eventType: 'detail' | 'open'; visitorId: string;
}) {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(input.visitorId)
    || input.subjectId.length < 1 || input.subjectId.length > 200
    || !['site', 'model'].includes(input.subjectType)
    || !['detail', 'open'].includes(input.eventType)
    || (input.subjectType === 'model' && input.eventType !== 'detail')) return { recorded: false };
  const result = await getPool().query(`WITH valid_subject AS (
      SELECT 1 FROM gateway_sites WHERE $1 = 'site' AND slug = $2 AND status = 'online' AND type = 'gateway'
      UNION ALL
      SELECT 1 FROM gateway_model_prices AS price JOIN gateway_sites AS site ON site.site_id = price.site_id
      WHERE $1 = 'model' AND price.model_id = $2 AND site.status = 'online' AND site.type = 'gateway' LIMIT 1
    ), inserted AS (
      INSERT INTO gateway_engagement_visitors (subject_type, subject_id, event_type, observed_date, visitor_id)
      SELECT $1, $2, $3, (now() AT TIME ZONE 'Asia/Shanghai')::date, $4::uuid
      WHERE EXISTS (SELECT 1 FROM valid_subject)
      ON CONFLICT DO NOTHING RETURNING observed_date
    ), counted AS (
      INSERT INTO gateway_engagement_daily (subject_type, subject_id, event_type, observed_date, count)
      SELECT $1, $2, $3, observed_date, 1 FROM inserted
      ON CONFLICT (subject_type, subject_id, event_type, observed_date)
      DO UPDATE SET count = gateway_engagement_daily.count + 1 RETURNING count
    ) SELECT count FROM counted`, [input.subjectType, input.subjectId, input.eventType, input.visitorId]);
  return { recorded: (result.rowCount ?? 0) > 0 };
}

function isoTimestamp(value: unknown): string | null {
  if (value == null) return null;
  return (value instanceof Date ? value : new Date(String(value))).toISOString();
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
  const labels: Record<string, string> = {
    newApi: 'New API',
    sub2Api: 'Sub2API',
    'custom-codekey': 'Sub2API',
    oneApi: 'One API',
    rixApi: 'Rix API',
    voApi: 'VoAPI',
    veloera: 'Veloera',
    anyRouter: 'AnyRouter',
    metapi: 'MetAPI',
  };
  return labels[family] ?? '';
}

function mapGatewaySiteRow(row: Record<string, unknown>): PublicGatewaySiteRow {
  const createdAt = isoTimestamp(row.created_at);
  const latestGatewayRefreshAt = isoTimestamp(row.latest_gateway_refresh_at);
  const family = row.family ? String(row.family) : '';
  const url = String(row.url);
  const inviteUrl = row.invite_url ? String(row.invite_url).trim() : '';
  const recentProviders = Array.isArray(row.recent_model_providers) ? row.recent_model_providers.map(String) : [];
  const recentFamilies = Array.isArray(row.recent_model_families) ? row.recent_model_families.map(String) : [];
  const declaredFamilies = Array.isArray(row.model_families) ? row.model_families.map(String) : [];
  const declaredProviders = Array.isArray(row.model_providers) ? row.model_providers.map(String) : [];
  return {
    id: String(row.id || ''),
    slug: String(row.slug || ''),
    name: String(row.site_name),
    url,
    outboundUrl: inviteUrl || url,
    host: row.host ? String(row.host) : hostFromUrl(url),
    family,
    displayFamily: displayGatewayFamily(family),
    domainRegisteredAt: isoTimestamp(row.domain_registered_at),
    createdAt,
    createdTime: formatBeijingRefreshTime(createdAt),
    lastProductRefreshCompleteAt: null,
    lastProductRefreshCompleteTime: '',
    siteScore: Number(row.score) || 0,
    sponsor: row.sponsor === true,
    supportTotalCents: Number(row.support_total_cents) || 0,
    supportPoints: Number(row.support_points) || 0,
    availabilityPercent: Number(row.availability_percent) || 0,
    avgSuccessLatencyMs: row.avg_success_latency_ms == null ? null : Number(row.avg_success_latency_ms),
    summary: String(row.summary || ''),
    modelProviders: Array.isArray(row.model_providers) ? row.model_providers.map(String) : [],
    paymentMethods: Array.isArray(row.payment_methods) ? row.payment_methods.map(String) : [],
    modelCount: Number(row.model_count) || 0,
    priceCount: Number(row.price_count) || 0,
    recentModelProviders: recentProviders,
    modelFamilies: declaredFamilies,
    recentModelFamilies: recentFamilies,
    displayModelFamilies: Number(row.price_count) > 0 ? recentFamilies : declaredFamilies,
    displayModelProviders: recentProviders.length > 0 ? recentProviders : [...new Set(declaredProviders)],
    refreshStatus: '',
    refreshErrorType: '',
    latestGatewayRefreshAt,
    latestGatewayRefreshTime: formatBeijingRefreshTime(latestGatewayRefreshAt),
  };
}

function mapGatewayModelSiteRow(row: Record<string, unknown>, modelId: string): PublicGatewayModelSiteRow {
  const latestModelRefreshAt = isoTimestamp(row.latest_model_refresh_at);
  return {
    ...mapGatewaySiteRow(row),
    priceCountForModel: Number(row.price_count_for_model) || 0,
    unitsForModel: Array.isArray(row.units_for_model) ? row.units_for_model.map(String) : [],
    pricesForModel: Array.isArray(row.prices_for_model) ? row.prices_for_model.map((price: Record<string, unknown>) => ({
      modelId,
      groupId: String(price.groupId || ''),
      groupName: String(price.groupName || ''),
      groupDescription: String(price.groupDescription || ''),
      modelFamily: price.modelFamily ? String(price.modelFamily) : null,
      unit: String(price.unit || ''),
      currency: price.currency ? String(price.currency) : null,
      inputPrice: price.inputPrice == null ? null : Number(price.inputPrice),
      outputPrice: price.outputPrice == null ? null : Number(price.outputPrice),
      cacheInputPrice: price.cacheInputPrice == null ? null : Number(price.cacheInputPrice),
      cacheOutputPrice: price.cacheOutputPrice == null ? null : Number(price.cacheOutputPrice),
    })) : [],
    latestModelRefreshAt,
    latestModelRefreshTime: formatBeijingRefreshTime(latestModelRefreshAt),
  };
}

export async function loadShopProductsData(options: { productLimit?: number; inStockOnly?: boolean; autoCategory?: string; queryClient?: pg.PoolClient; siteId?: string } = {}) {
  const db = options.queryClient ?? getPool();
  const safeProductLimit = typeof options.productLimit === 'number' && Number.isFinite(options.productLimit)
    ? Math.max(1, Math.floor(options.productLimit))
    : null;
  const categoryIds = options.autoCategory ? autoCategoryIdsForFilter(options.autoCategory) : null;
  const productParams: unknown[] = safeProductLimit ? [safeProductLimit] : [];
  if (options.siteId) productParams.push(options.siteId);
  const categoryParameter = `$${productParams.length + 1}`;
  if (categoryIds) productParams.push(categoryIds);
  const sitesResult = safeProductLimit === null
    ? await db.query(`
      WITH ranked_sites AS (
      SELECT
        id,
        slug,
        name,
        family,
        url,
        score,
        sponsor,
        support_total_cents,
        support_points,
        last_product_refresh_success_at,
        product_count,
        in_stock_product_count,
        ROW_NUMBER() OVER (
          ORDER BY CASE WHEN sponsor THEN 0 WHEN support_points > 0 THEN 1 ELSE 2 END, support_points DESC, score DESC, product_count DESC, in_stock_product_count DESC, last_product_refresh_success_at DESC NULLS LAST, id ASC
        ) AS group_position
      FROM shop_sites
      WHERE status = 'online'
        AND type = 'cardShop'
        ${options.siteId ? 'AND id = $1' : ''}
      )
      SELECT * FROM ranked_sites
      ORDER BY
        CASE
          WHEN sponsor AND group_position <= ${MAX_PINNED_COMMERCIAL} THEN 0
          WHEN NOT sponsor AND support_points > 0 AND group_position <= ${MAX_PINNED_COMMERCIAL} THEN 1
          ELSE 2
        END,
        CASE WHEN sponsor AND group_position <= ${MAX_PINNED_COMMERCIAL}
            OR NOT sponsor AND support_points > 0 AND group_position <= ${MAX_PINNED_COMMERCIAL}
          THEN support_points END DESC NULLS LAST,
        score DESC, product_count DESC, in_stock_product_count DESC, last_product_refresh_success_at DESC NULLS LAST, id ASC
    `, options.siteId ? [options.siteId] : [])
    : null;
  const productsResult = await db.query(`
    WITH base_products AS (
      SELECT
        shop_products.id AS product_row_id,
        shop_products.site_id,
        shop_sites.slug AS site_slug,
        shop_sites.name AS site_name,
        shop_sites.family AS site_family,
        shop_sites.url AS site_url,
        shop_sites.score AS site_score,
        shop_sites.sponsor AS site_sponsor,
        shop_sites.support_total_cents AS site_support_total_cents,
        shop_sites.support_points AS site_support_points,
        shop_sites.last_product_refresh_success_at AS site_product_refresh_success_at,
        shop_products.category_name,
        shop_products.auto_category,
        shop_products.name,
        shop_products.price,
        shop_products.price_number,
        shop_products.price_unit,
        shop_products.product_url,
        shop_products.stock,
        shop_products.in_stock,
        shop_products.score,
        shop_products.shop_recommendation,
        shop_products.refreshed_at
      FROM shop_products
      INNER JOIN shop_sites ON shop_sites.id = shop_products.site_id
      WHERE shop_sites.status = 'online'
        AND shop_sites.type = 'cardShop'
        AND shop_products.active = true
        ${options.siteId ? `AND shop_sites.id = $${safeProductLimit ? 2 : 1}` : ''}
        ${options.inStockOnly ? 'AND shop_products.in_stock = TRUE' : ''}
        ${categoryIds ? `AND shop_products.auto_category = ANY(${categoryParameter}::text[])` : ''}
    ), site_pin_candidates AS (
      SELECT candidate.id AS product_row_id, candidate.*,
        site.support_points AS site_support_points, CASE WHEN site.sponsor THEN 0 ELSE 1 END AS pin_group
      FROM shop_sites site
      CROSS JOIN LATERAL (
        SELECT id, site_id, score, shop_recommendation,
          FIRST_VALUE(score) OVER (ORDER BY score DESC, id ASC) AS best_score,
          FIRST_VALUE(id) OVER (ORDER BY score DESC, id ASC) AS best_id,
          ROW_NUMBER() OVER (ORDER BY shop_recommendation DESC, score DESC, id ASC) AS site_position
        FROM shop_products
        WHERE site_id = site.id AND active = TRUE
          ${options.inStockOnly ? 'AND in_stock = TRUE' : ''}
          ${categoryIds ? `AND auto_category = ANY(${categoryParameter}::text[])` : ''}
        ORDER BY shop_recommendation DESC, score DESC, id ASC
        LIMIT ${MAX_PINNED_ROWS_PER_SITE}
      ) candidate
      WHERE site.status = 'online' AND site.type = 'cardShop' AND (site.sponsor OR site.support_points > 0)
    ), ranked_pin_sites AS (
      SELECT site_id, ROW_NUMBER() OVER (PARTITION BY pin_group ORDER BY site_support_points DESC,
        best_score DESC, best_id ASC) AS site_rank
      FROM site_pin_candidates WHERE site_position = 1
    ), pin_candidates AS (
      SELECT candidate.product_row_id, candidate.site_id, candidate.score, candidate.site_position,
        candidate.pin_group, candidate.site_support_points,
        ROW_NUMBER() OVER (ORDER BY candidate.site_position, candidate.pin_group, ranked.site_rank) AS pin_position
      FROM site_pin_candidates candidate
      INNER JOIN ranked_pin_sites ranked ON ranked.site_id = candidate.site_id
      WHERE candidate.site_position = 1 OR candidate.pin_group = 0
        OR (SELECT COUNT(*) FROM ranked_pin_sites) <= ${MAX_SUPPORT_SITES_FOR_SECOND_PIN}
    ), selected_pin_slots AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY site_id ORDER BY score DESC, product_row_id ASC) AS slot_position
      FROM pin_candidates WHERE pin_position <= ${MAX_PINNED_COMMERCIAL}
    ), display_pins AS (
      SELECT candidate.product_row_id, candidate.pin_group, candidate.site_support_points,
        slot.score AS display_score, slot.product_row_id AS display_id
      FROM pin_candidates candidate
      JOIN selected_pin_slots slot ON slot.site_id = candidate.site_id AND slot.slot_position = candidate.site_position
      WHERE candidate.pin_position <= ${MAX_PINNED_COMMERCIAL}
    )
    SELECT base_products.*,
      CASE WHEN pinned.product_row_id IS NOT NULL THEN pinned.pin_group ELSE 2 END AS display_group,
      pinned.site_support_points AS display_points
    FROM base_products
    LEFT JOIN display_pins AS pinned ON pinned.product_row_id = base_products.product_row_id
    ORDER BY ${options.siteId ? '' : 'display_group, display_points DESC NULLS LAST, COALESCE(pinned.display_score, base_products.score) DESC, COALESCE(pinned.display_id, base_products.product_row_id) ASC,'}
      base_products.score DESC, base_products.product_row_id ASC
    ${safeProductLimit ? 'LIMIT $1' : ''}
  `, productParams);

  const products: PublicProductRow[] = productsResult.rows.map(row => {
    const refreshedAt = isoTimestamp(row.refreshed_at);
    const siteProductRefreshSuccessAt = isoTimestamp(row.site_product_refresh_success_at);
    return {
      id: String(row.product_row_id),
      categoryName: String(row.category_name),
      autoCategory: String(row.auto_category),
      name: String(row.name),
      price: String(row.price),
      priceNumber: typeof row.price_number === 'number' ? Number(row.price_number) : null,
      priceUnit: typeof row.price_unit === 'string' ? String(row.price_unit) : null,
      ...(row.product_url ? { productUrl: String(row.product_url) } : {}),
      ...(typeof row.stock === 'number' ? { stock: row.stock } : {}),
      inStock: Boolean(row.in_stock),
      refreshedAt,
      refreshTime: formatBeijingRefreshTime(refreshedAt),
      siteId: String(row.site_id),
      siteSlug: String(row.site_slug || ''),
      siteName: String(row.site_name),
      sitePlatformName: shopPlatformName(row.site_family),
      siteUrl: String(row.site_url),
      siteProductRefreshSuccessAt,
      siteProductRefreshSuccessTime: formatBeijingRefreshTime(siteProductRefreshSuccessAt),
      siteScore: Number(row.site_score) || 0,
      siteSponsor: row.site_sponsor === true,
      siteSupportTotalCents: Number(row.site_support_total_cents) || 0,
      siteSupportPoints: Number(row.site_support_points) || 0,
      score: Number(row.score) || 0,
      ...(Number(row.shop_recommendation) > 0 ? { shopRecommendation: Number(row.shop_recommendation) } : {}),
    };
  });

  const sites: PublicSiteRow[] = sitesResult
    ? sitesResult.rows.map(row => ({
      id: String(row.id),
      slug: String(row.slug || ''),
      name: String(row.name),
      platformName: shopPlatformName(row.family),
      url: String(row.url),
      lastProductRefreshSuccessAt: isoTimestamp(row.last_product_refresh_success_at),
      lastProductRefreshSuccessTime: formatBeijingRefreshTime(isoTimestamp(row.last_product_refresh_success_at)),
      score: Number(row.score) || 0,
      sponsor: row.sponsor === true,
      supportTotalCents: Number(row.support_total_cents) || 0,
      supportPoints: Number(row.support_points) || 0,
    }))
    : (() => {
      const siteById = new Map<string, PublicSiteRow>();
      for (const row of productsResult.rows) {
        const siteId = String(row.site_id);
        if (siteById.has(siteId)) continue;
        const lastProductRefreshSuccessAt = isoTimestamp(row.site_product_refresh_success_at);
        siteById.set(siteId, {
          id: siteId,
          slug: String(row.site_slug || ''),
          name: String(row.site_name),
          platformName: shopPlatformName(row.site_family),
          url: String(row.site_url),
          lastProductRefreshSuccessAt,
          lastProductRefreshSuccessTime: formatBeijingRefreshTime(lastProductRefreshSuccessAt),
          score: Number(row.site_score) || 0,
          sponsor: row.site_sponsor === true,
          supportTotalCents: Number(row.site_support_total_cents) || 0,
          supportPoints: Number(row.site_support_points) || 0,
        });
      }
      return [...siteById.values()];
    })();
  const summaryResult = await db.query(`
    SELECT COUNT(*)::INTEGER AS total_site_count,
      COALESCE(SUM(product_count), 0)::INTEGER AS total_product_count,
      COALESCE(SUM(in_stock_product_count), 0)::INTEGER AS total_in_stock_product_count,
      MAX(last_product_refresh_success_at) AS latest_refreshed_at
    FROM shop_sites WHERE status = 'online' AND type = 'cardShop'
      ${options.siteId ? 'AND id = $1' : ''}
  `, options.siteId ? [options.siteId] : []);
  const summaryRow = summaryResult.rows[0] ?? {};
  const totalSiteCount = Number(summaryRow.total_site_count) || 0;
  const allProductCount = Number(summaryRow.total_product_count) || 0;
  const totalInStockProductCount = Number(summaryRow.total_in_stock_product_count) || 0;
  const totalProductCount = allProductCount;
  const partialTotalCount = options.inStockOnly ? totalInStockProductCount : totalProductCount;
  const latestRefreshedAt = isoTimestamp(summaryRow.latest_refreshed_at);

  return {
    sites,
    products,
    totalSiteCount,
    totalProductCount,
    totalInStockProductCount,
    latestRefreshedAt,
    latestRefreshTime: formatBeijingRefreshTime(latestRefreshedAt),
    ...(safeProductLimit === null ? {} : { initialProductLimit: safeProductLimit }),
    isPartial: partialTotalCount > products.length,
  };
}

export async function loadGatewaySites(options: PublicListLimitOptions & { queryClient?: pg.PoolClient } = {}) {
  const db = options.queryClient ?? getPool();
  const limit = safeListLimit(options.limit);
  const result = await db.query(`
    WITH ranked_sites AS (
    SELECT
      gateway_sites.site_id AS id,
      gateway_sites.name AS site_name,
      gateway_sites.url,
      gateway_sites.family,
      gateway_sites.score,
      gateway_sites.weight AS sort_weight,
      gateway_sites.availability_percent,
      gateway_sites.avg_success_latency_ms,
      gateway_sites.created_at,
      gateway_sites.slug,
      gateway_sites.host,
      gateway_sites.summary,
      gateway_sites.invite_url,
      gateway_sites.sponsor,
      gateway_sites.support_total_cents,
      gateway_sites.support_points,
      gateway_sites.model_providers,
      gateway_sites.model_families,
      gateway_sites.payment_methods,
      gateway_sites.model_count,
      gateway_sites.price_count,
      gateway_sites.recent_model_providers,
      gateway_sites.recent_model_families,
      gateway_sites.latest_price_fetched_at AS latest_gateway_refresh_at,
      ROW_NUMBER() OVER (
        ORDER BY CASE WHEN gateway_sites.sponsor THEN 0 WHEN gateway_sites.support_points > 0 THEN 1 ELSE 2 END, gateway_sites.support_points DESC, gateway_sites.score DESC, gateway_sites.weight DESC, gateway_sites.created_at DESC NULLS LAST, gateway_sites.name ASC, gateway_sites.site_id ASC
      ) AS group_position
    FROM gateway_sites
    WHERE gateway_sites.status = 'online' AND gateway_sites.type = 'gateway'
    )
    SELECT * FROM ranked_sites
    ORDER BY
      CASE
        WHEN sponsor AND group_position <= ${MAX_PINNED_COMMERCIAL} THEN 0
        WHEN NOT sponsor AND support_points > 0 AND group_position <= ${MAX_PINNED_COMMERCIAL} THEN 1
        ELSE 2
      END,
      CASE WHEN sponsor AND group_position <= ${MAX_PINNED_COMMERCIAL}
          OR NOT sponsor AND support_points > 0 AND group_position <= ${MAX_PINNED_COMMERCIAL}
        THEN support_points END DESC NULLS LAST,
      score DESC, sort_weight DESC, created_at DESC NULLS LAST, site_name ASC, id ASC
    ${limit ? 'LIMIT $1' : ''}
  `, limit ? [limit] : []);

  const summaryResult = await db.query(`
    SELECT COUNT(*)::INTEGER AS total_site_count,
      COUNT(*) FILTER (WHERE price_count > 0)::INTEGER AS sites_with_prices_count,
      COALESCE(SUM(model_count), 0)::INTEGER AS total_model_count,
      COALESCE(SUM(price_count), 0)::INTEGER AS total_price_count,
      MAX(latest_price_fetched_at) AS latest_refreshed_at
    FROM gateway_sites WHERE status = 'online' AND type = 'gateway'
  `);
  const summaryRow = summaryResult.rows[0] ?? {};

  const sites: PublicGatewaySiteRow[] = result.rows.map(row => mapGatewaySiteRow(row));

  return {
    sites,
    totalSiteCount: Number(summaryRow.total_site_count) || 0,
    latestRefreshedAt: isoTimestamp(summaryRow.latest_refreshed_at),
    sitesWithPricesCount: Number(summaryRow.sites_with_prices_count) || 0,
    totalModelCount: Number(summaryRow.total_model_count) || 0,
    totalPriceCount: Number(summaryRow.total_price_count) || 0,
  };
}

export async function loadGatewayModels(options: PublicListLimitOptions & { sort?: 'release' | 'popular' } = {}) {
  const limit = safeListLimit(options.limit);
  const result = await getPool().query(`
    SELECT model_id, model_provider, model_family, support_site_count, price_count, release_date::text,
      latest_price_fetched_at AS latest_gateway_refresh_at
    FROM gateway_model_summaries
    ORDER BY ${options.sort === 'popular' ? '' : 'CASE WHEN release_date IS NULL THEN 2 WHEN is_official_model_id THEN 0 ELSE 1 END ASC, release_date DESC NULLS LAST,'} support_site_count DESC, max_site_score DESC, model_id ASC, model_provider ASC
    ${limit ? 'LIMIT $1' : ''}
  `, limit ? [limit] : []);
  const summaryResult = await getPool().query(`
    SELECT COUNT(*)::INTEGER AS total_model_count,
      COALESCE(SUM(support_site_count), 0)::INTEGER AS total_support_count
    FROM gateway_model_summaries
  `);
  const summaryRow = summaryResult.rows[0] ?? {};

  const models: PublicGatewayModelRow[] = result.rows.map(row => {
    const modelId = String(row.model_id);
    const latestGatewayRefreshAt = isoTimestamp(row.latest_gateway_refresh_at);
    return {
      id: modelId,
      modelId,
      releaseDate: row.release_date ?? null,
      modelProvider: String(row.model_provider || 'Other'),
      modelFamily: row.model_family ? String(row.model_family) : null,
      supportSiteCount: Number(row.support_site_count) || 0,
      priceCount: Number(row.price_count) || 0,
      latestGatewayRefreshAt,
      latestGatewayRefreshTime: formatBeijingRefreshTime(latestGatewayRefreshAt),
    };
  });

  return {
    models,
    totalModelCount: Number(summaryRow.total_model_count) || 0,
    totalSupportCount: Number(summaryRow.total_support_count) || 0,
  };
}

export async function loadGatewaySiteBySlug(slug: string): Promise<PublicGatewaySiteRow | null> {
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) return null;
  const result = await getPool().query(`
    SELECT
      gateway_sites.site_id AS id,
      gateway_sites.name AS site_name,
      gateway_sites.url,
      gateway_sites.api_endpoint,
      gateway_sites.family,
      gateway_sites.score,
      gateway_sites.availability_percent,
      gateway_sites.avg_success_latency_ms,
      gateway_sites.created_at,
      gateway_sites.domain_registered_at,
      gateway_sites.slug,
      gateway_sites.host,
      gateway_sites.summary,
      gateway_sites.invite_url,
      gateway_sites.sponsor,
      gateway_sites.support_total_cents,
      gateway_sites.support_points,
      gateway_sites.model_providers,
      gateway_sites.model_families,
      gateway_sites.payment_methods,
      gateway_sites.model_count,
      gateway_sites.price_count,
      gateway_sites.recent_model_providers,
      gateway_sites.recent_model_families,
      gateway_sites.latest_price_fetched_at AS latest_gateway_refresh_at
    FROM gateway_sites
    WHERE gateway_sites.status = 'online'
      AND gateway_sites.type = 'gateway'
      AND gateway_sites.slug = $1
    LIMIT 1
  `, [normalizedSlug]);
  const row = result.rows[0];
  if (!row) return null;
  return { ...mapGatewaySiteRow(row), apiEndpoint: String(row.api_endpoint || '').trim() };
}

async function loadGatewayModelSummary(modelId: string): Promise<PublicGatewayModelRow | null> {
  const normalizedModelId = modelId.trim();
  if (!normalizedModelId) return null;
  const result = await getPool().query(`
    SELECT prices.model_id, COALESCE(NULLIF(prices.model_provider, ''), 'Other') AS model_provider, prices.model_family,
      COUNT(DISTINCT prices.site_id)::INTEGER AS support_site_count,
      COUNT(*)::INTEGER AS price_count, MAX(prices.fetched_at) AS latest_gateway_refresh_at,
      MAX(summary.release_date)::text AS release_date
    FROM gateway_model_prices prices
    INNER JOIN gateway_sites ON gateway_sites.site_id = prices.site_id
    LEFT JOIN gateway_model_summaries summary ON summary.model_id = prices.model_id
      AND summary.model_provider = COALESCE(NULLIF(prices.model_provider, ''), 'Other')
    WHERE prices.model_id = $1 AND gateway_sites.status = 'online' AND gateway_sites.type = 'gateway'
    GROUP BY prices.model_id, COALESCE(NULLIF(prices.model_provider, ''), 'Other'), prices.model_family
    ORDER BY COUNT(DISTINCT prices.site_id) DESC, MAX(gateway_sites.score) DESC, model_provider ASC
    LIMIT 1
  `, [normalizedModelId]);
  const row = result.rows[0];
  if (!row) return null;
  const latestGatewayRefreshAt = isoTimestamp(row.latest_gateway_refresh_at);
  return {
    id: String(row.model_id),
    modelId: String(row.model_id),
    releaseDate: row.release_date ?? null,
    modelProvider: String(row.model_provider || 'Other'),
    modelFamily: row.model_family ? String(row.model_family) : null,
    supportSiteCount: Number(row.support_site_count) || 0,
    priceCount: Number(row.price_count) || 0,
    latestGatewayRefreshAt,
    latestGatewayRefreshTime: formatBeijingRefreshTime(latestGatewayRefreshAt),
  };
}

export async function loadGatewayDetail(slug: string, options: { priceLimit?: number } = {}): Promise<PublicGatewayDetail | null> {
  const site = await loadGatewaySiteBySlug(slug);
  if (!site) return null;
  const priceLimit = safeListLimit(options.priceLimit);

  const priceResult = await getPool().query(`
    SELECT
      prices.model_id,
      prices.model_family,
      prices.group_id,
      prices.group_name,
      prices.group_description,
      prices.unit,
      prices.currency,
      prices.input_price,
      prices.output_price,
      prices.cache_input_price,
      prices.cache_output_price
    FROM gateway_model_prices prices
    LEFT JOIN gateway_model_summaries summary
      ON summary.model_id = prices.model_id
      AND summary.model_provider = COALESCE(NULLIF(prices.model_provider, ''), 'Other')
    WHERE prices.site_id = $1
    ORDER BY CASE WHEN summary.release_date IS NULL THEN 2 WHEN summary.is_official_model_id THEN 0 ELSE 1 END ASC,
      summary.release_date DESC NULLS LAST,
      CASE prices.model_provider
        WHEN 'OpenAI' THEN 1
        WHEN 'Anthropic' THEN 2
        WHEN 'Google' THEN 3
        WHEN 'Alibaba' THEN 4
        WHEN 'xAI' THEN 5
        ELSE 20
      END ASC,
      prices.model_id ASC,
      prices.unit ASC, prices.currency ASC, prices.group_id ASC
    ${priceLimit ? 'LIMIT $2' : ''}
  `, priceLimit ? [site.id, priceLimit] : [site.id]);

  return {
    site,
    prices: priceResult.rows.map(row => ({
      modelId: String(row.model_id),
      groupId: String(row.group_id || ''),
      groupName: String(row.group_name || ''),
      groupDescription: String(row.group_description || ''),
      modelFamily: row.model_family ? String(row.model_family) : null,
      unit: String(row.unit || ''),
      currency: row.currency ? String(row.currency) : null,
      inputPrice: row.input_price == null ? null : Number(row.input_price),
      outputPrice: row.output_price == null ? null : Number(row.output_price),
      cacheInputPrice: row.cache_input_price == null ? null : Number(row.cache_input_price),
      cacheOutputPrice: row.cache_output_price == null ? null : Number(row.cache_output_price),
    })),
  };
}

export async function loadGatewayModelDetail(pathId: string, options: { siteLimit?: number } = {}): Promise<PublicGatewayModelDetail | null> {
  const modelId = pathId.trim();
  if (!modelId) return null;
  const siteLimit = safeListLimit(options.siteLimit);

  const model = await loadGatewayModelSummary(modelId);
  if (!model) return null;

  const result = await getPool().query(`
    WITH model_price_summary AS (
      SELECT
        site_id,
        COUNT(*)::INTEGER AS price_count_for_model,
        ARRAY_AGG(DISTINCT unit ORDER BY unit) FILTER (WHERE unit <> '') AS units_for_model,
        jsonb_agg(
          jsonb_build_object(
            'modelFamily', model_family,
            'groupId', group_id,
            'groupName', group_name,
            'groupDescription', group_description,
            'unit', unit,
            'currency', currency,
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
    ranked_sites AS (
    SELECT
      gateway_sites.site_id AS id,
      gateway_sites.name AS site_name,
      gateway_sites.url,
      gateway_sites.family,
      gateway_sites.score,
      gateway_sites.weight AS sort_weight,
      gateway_sites.availability_percent,
      gateway_sites.avg_success_latency_ms,
      gateway_sites.created_at,
      gateway_sites.slug,
      gateway_sites.host,
      gateway_sites.summary,
      gateway_sites.invite_url,
      gateway_sites.sponsor,
      gateway_sites.support_total_cents,
      gateway_sites.support_points,
      gateway_sites.model_providers,
      gateway_sites.model_families,
      gateway_sites.payment_methods,
      gateway_sites.model_count,
      gateway_sites.price_count,
      gateway_sites.recent_model_providers,
      gateway_sites.recent_model_families,
      gateway_sites.latest_price_fetched_at AS latest_gateway_refresh_at,
      model_price_summary.price_count_for_model,
      COALESCE(model_price_summary.units_for_model, ARRAY[]::text[]) AS units_for_model,
      COALESCE(model_price_summary.prices_for_model, '[]'::jsonb) AS prices_for_model,
      model_price_summary.latest_model_refresh_at,
      ROW_NUMBER() OVER (
        ORDER BY CASE WHEN gateway_sites.sponsor THEN 0 WHEN gateway_sites.support_points > 0 THEN 1 ELSE 2 END, gateway_sites.support_points DESC, gateway_sites.score DESC, gateway_sites.weight DESC, gateway_sites.created_at DESC NULLS LAST, gateway_sites.name ASC, gateway_sites.site_id ASC
      ) AS group_position
    FROM model_price_summary
    INNER JOIN gateway_sites ON gateway_sites.site_id = model_price_summary.site_id
    WHERE gateway_sites.status = 'online' AND gateway_sites.type = 'gateway'
    )
    SELECT * FROM ranked_sites
    ORDER BY
      CASE
        WHEN sponsor AND group_position <= ${MAX_PINNED_COMMERCIAL} THEN 0
        WHEN NOT sponsor AND support_points > 0 AND group_position <= ${MAX_PINNED_COMMERCIAL} THEN 1
        ELSE 2
      END,
      CASE WHEN sponsor AND group_position <= ${MAX_PINNED_COMMERCIAL}
          OR NOT sponsor AND support_points > 0 AND group_position <= ${MAX_PINNED_COMMERCIAL}
        THEN support_points END DESC NULLS LAST,
      score DESC, sort_weight DESC, created_at DESC NULLS LAST, site_name ASC, id ASC
    ${siteLimit ? 'LIMIT $2' : ''}
  `, siteLimit ? [modelId, siteLimit] : [modelId]);

  return {
    model,
    sites: result.rows.map(row => mapGatewayModelSiteRow(row, modelId)),
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

const resubmittableUrlStatuses = ['deferred', 'needs_review', 'invalid', 'unsupported', 'offline'];

export async function submitSiteUrl(input: string) {
  const validation = validatePublicSubmittedUrl(input);
  if (!validation.ok) {
    return { ok: false as const, errorKey: validation.reason satisfies SubmitSiteUrlErrorKey };
  }
  const url = validation.url;

  const result = await getPool().query(
    `
      INSERT INTO shop_sites (id, url, status, family, type)
      VALUES (md5(regexp_replace(split_part($1, '#', 1), '/$', '') || $2), $1, 'accepted', 'unknown', 'unknown')
      ON CONFLICT (url) DO UPDATE SET
        status = 'accepted', ingest_retry_count = 0, last_ingest_complete_at = NULL,
        last_ingest_error_type = NULL, last_ingest_error_message = NULL, updated_at = now()
      WHERE shop_sites.status = ANY($3::text[])
      RETURNING url
    `,
    [url, '2164802aa948726ee717662bcc17f7295e278340d9dcf4f0', resubmittableUrlStatuses],
  );
  if (result.rows.length === 0) {
    return { ok: false as const, errorKey: 'duplicateUrl' satisfies SubmitSiteUrlErrorKey };
  }
  return { ok: true as const, url };
}

const publicGatewayPaymentMethods = new Set([
  'alipay', 'wechat', 'visa', 'mastercard', 'stripe', 'paypal', 'tether', 'bitcoin', 'applepay', 'googlepay',
]);

function publicGatewaySlug(host: string) {
  const slug = host.toLowerCase().replace(/^www\./, '').replace(/\.[a-z]{2,}$/i, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'gateway';
}

export async function submitGatewaySite(input: { url: string; apiEndpoint?: string; name: string; summary: string; paymentMethods: string[] }) {
  const validation = validatePublicSubmittedUrl(input.url);
  if (!validation.ok) return { ok: false as const, errorKey: 'gatewayInvalidUrl' satisfies SubmitSiteUrlErrorKey };
  const apiEndpointInput = input.apiEndpoint?.trim() ?? '';
  let apiEndpoint = '';
  if (apiEndpointInput) {
    const endpointValidation = validatePublicSubmittedUrl(apiEndpointInput);
    if (!endpointValidation.ok) {
      return { ok: false as const, errorKey: 'gatewayInvalidApiEndpoint' satisfies SubmitSiteUrlErrorKey };
    }
    apiEndpoint = endpointValidation.url;
  }
  const name = input.name.trim();
  const summary = input.summary.trim();
  const paymentMethods = [...new Set(input.paymentMethods.map(value => value.trim().toLowerCase()))].filter(value => publicGatewayPaymentMethods.has(value));
  if (!name) return { ok: false as const, errorKey: 'invalidGatewayName' as const };
  if (name.length > 20) return { ok: false as const, errorKey: 'gatewayNameTooLong' as const };
  if (summary.length > 150) return { ok: false as const, errorKey: 'gatewaySummaryTooLong' as const };
  const url = validation.url;
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  const db = getPool();
  const baseSlug = publicGatewaySlug(host);
  let slug = baseSlug;
  for (let index = 2; index <= 1000; index += 1) {
    if ((await db.query('SELECT 1 FROM gateway_sites WHERE slug = $1 LIMIT 1', [slug])).rows.length === 0) break;
    slug = `${baseSlug}-${index}`;
  }
  const result = await db.query(
    `INSERT INTO gateway_sites (url, api_endpoint, status, site_id, name, family, type, slug, host, weight, summary, payment_methods)
     VALUES ($1, $2, 'accepted', md5($1 || $3), $4, NULL, 'unknown', $5, $6, 50, $7, $8::text[])
     ON CONFLICT (url) DO UPDATE SET
       status = 'accepted', retry_count = 0, last_ingest_complete_at = NULL,
       last_error_type = NULL, last_error_message = NULL, updated_at = now()
     WHERE gateway_sites.status = ANY($9::text[])
     RETURNING url`,
    [url, apiEndpoint, '2164802aa948726ee717662bcc17f7295e278340d9dcf4f0', name, slug, host, summary, paymentMethods, resubmittableUrlStatuses],
  );
  if (result.rows.length === 0) return { ok: false as const, errorKey: 'duplicateUrl' satisfies SubmitSiteUrlErrorKey };
  return { ok: true as const, url };
}

export async function recordSearchTerm(term: string, resultCount: number) {
  const normalized = normalizeSearchText(term);
  const safeResultCount = Number.isFinite(resultCount) ? Math.max(0, Math.floor(resultCount)) : 0;
  if (!normalized || normalized.length < 2) return { recorded: false };
  if (/^https?:\/\//i.test(normalized) || /\/shop\//i.test(normalized) || /[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(normalized)) {
    return { recorded: false };
  }

  await getPool().query(`
    WITH daily AS (
      INSERT INTO shop_search_terms_daily (observed_date, term, search_count, no_result_count)
      VALUES ((now() AT TIME ZONE 'Asia/Shanghai')::date, $1, 1, CASE WHEN $2 = 0 THEN 1 ELSE 0 END)
      ON CONFLICT (observed_date, term) DO UPDATE SET
        search_count = shop_search_terms_daily.search_count + 1,
        no_result_count = shop_search_terms_daily.no_result_count + EXCLUDED.no_result_count
      RETURNING term
    )
    INSERT INTO shop_search_terms (term, total_count, result_count, last_seen_at)
    SELECT term, 1, $2, now() FROM daily
    ON CONFLICT (term) DO UPDATE SET
      total_count = shop_search_terms.total_count + 1,
      result_count = EXCLUDED.result_count,
      last_seen_at = now()
  `, [normalized, safeResultCount]);
  return { recorded: true };
}

type VisitorProductEventInput = Omit<ProductMetricInput, 'scene' | 'displayType' | 'positionBucket'> & {
  scene: ProductMetricInput['scene'] | 'merchant';
  displayType: ProductMetricInput['displayType'] | 'merchant';
  positionBucket: ProductMetricInput['positionBucket'] | 'unknown';
};

async function writeVisitorProductEvent(client: pg.PoolClient, input: VisitorProductEventInput) {
  if (!/^[0-9a-f]{32}$/i.test(input.productId)
    || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(input.visitorId)) {
    return { recorded: false };
  }
  await client.query(`
    INSERT INTO shop_product_visitor_events (product_id, observed_date, visitor_id)
    SELECT product.id, (now() AT TIME ZONE 'Asia/Shanghai')::date, $2::uuid
    FROM shop_products AS product
    INNER JOIN shop_sites AS site ON site.id = product.site_id
    WHERE product.id = $1 AND product.active = true
      AND site.status = 'online' AND site.type = 'cardShop'
    ON CONFLICT (product_id, observed_date, visitor_id) DO NOTHING
  `, [input.productId, input.visitorId]);
  const event = await client.query(`
    SELECT visitor.impression_group, visitor.click_group
    FROM shop_product_visitor_events AS visitor
    INNER JOIN shop_products AS product ON product.id = visitor.product_id
    INNER JOIN shop_sites AS site ON site.id = product.site_id
    WHERE visitor.product_id = $1 AND visitor.visitor_id = $2::uuid
      AND visitor.observed_date = (now() AT TIME ZONE 'Asia/Shanghai')::date
      AND product.active = true AND site.status = 'online' AND site.type = 'cardShop'
    FOR UPDATE OF visitor
  `, [input.productId, input.visitorId]);
  const prior = event.rows[0];
  if (!prior || (input.eventType === 'impression' ? prior.impression_group : prior.click_group)) {
    return { recorded: false };
  }

  const newClick = input.eventType === 'click';
  const requestedGroup = `${input.scene}|${input.displayType}|${input.positionBucket}`;
  const group = newClick ? requestedGroup : prior.impression_group ?? requestedGroup;
  const newImpression = prior.impression_group == null || (newClick && prior.impression_group !== requestedGroup);
  await client.query(`
    UPDATE shop_product_visitor_events
    SET impression_group = COALESCE(impression_group, $3),
      click_group = CASE WHEN $4::boolean THEN $3 ELSE click_group END
    WHERE product_id = $1 AND visitor_id = $2::uuid
      AND observed_date = (now() AT TIME ZONE 'Asia/Shanghai')::date
  `, [input.productId, input.visitorId, group, newClick]);
  await client.query(`
    INSERT INTO shop_product_daily (product_id, observed_date, clicks, metric_groups)
    VALUES ($1, (now() AT TIME ZONE 'Asia/Shanghai')::date, $3::integer,
      jsonb_build_object($2::text,
        jsonb_build_object('impressions', $4::integer, 'clicks', $3::integer)))
    ON CONFLICT (product_id, observed_date) DO UPDATE SET
      clicks = shop_product_daily.clicks + EXCLUDED.clicks,
      metric_groups = jsonb_set(shop_product_daily.metric_groups, ARRAY[$2::text],
        jsonb_build_object(
          'impressions', COALESCE((shop_product_daily.metric_groups->($2::text)->>'impressions')::integer, 0) + $4::integer,
          'clicks', COALESCE((shop_product_daily.metric_groups->($2::text)->>'clicks')::integer, 0) + $3::integer
        ), true)
  `, [input.productId, group, Number(newClick), Number(newImpression)]);
  return { recorded: true };
}

async function recordVisitorProductEvents(inputs: VisitorProductEventInput[]) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    let recorded = false;
    // Stable product order prevents deadlocks between overlapping batches.
    for (const input of [...inputs].sort((a, b) => a.productId.localeCompare(b.productId) || a.visitorId.localeCompare(b.visitorId))) {
      const result = await writeVisitorProductEvent(client, input);
      recorded ||= result.recorded;
    }
    await client.query('COMMIT');
    return { recorded };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Store every navigation while retaining visitor/product/day aggregate deduplication. */
export async function recordShopClicks(inputs: ShopClickEvent[]) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    let recorded = false;
    for (const input of [...inputs].sort((a, b) => (a.productId || '').localeCompare(b.productId || '') || a.visitorId.localeCompare(b.visitorId) || a.eventId.localeCompare(b.eventId))) {
      const site = input.productId
        ? await client.query(`SELECT site.id FROM shop_products product JOIN shop_sites site ON site.id = product.site_id
            WHERE product.id = $1 AND product.active = true AND site.status = 'online' AND site.type = 'cardShop'`, [input.productId])
        : await client.query(`SELECT id FROM shop_sites WHERE id = $1 AND status = 'online' AND type = 'cardShop'`, [input.siteId]);
      if (!site.rows[0]) continue;
      const result = await client.query(`INSERT INTO shop_click_events (
          event_id, occurred_at, visitor_id, session_id, context_id, site_id, product_id,
          source_page, filters, position, region, pin_reason, is_partner, is_supporter, risk_dialog_shown
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (event_id) DO NOTHING RETURNING event_id`, [
        input.eventId, input.occurredAt, input.visitorId, input.sessionId, input.contextId,
        site.rows[0].id, input.productId || null, input.sourcePage, JSON.stringify(input.filters),
        input.position, input.region, input.pinReason, input.isPartner, input.isSupporter, input.riskDialogShown,
      ]);
      if (!result.rowCount) continue;
      recorded = true;
      if (input.productId) {
        const merchant = !input.position || input.filters.tab === 'shops';
        await writeVisitorProductEvent(client, {
          productId: input.productId, visitorId: input.visitorId, eventType: 'click',
          scene: merchant ? 'merchant' : input.filters.q ? 'search' : 'default',
          displayType: merchant ? 'merchant' : input.displayType,
          positionBucket: merchant || !input.position ? 'unknown' : input.position <= 5 ? '1-5' : input.position <= 20 ? '6-20' : '21+',
        });
      }
    }
    await client.query('COMMIT');
    return { recorded };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function recordMerchantProductClicks(inputs: { productId: string; visitorId: string }[]) {
  return recordVisitorProductEvents(inputs.map(input => ({
    ...input, eventType: 'click', scene: 'merchant', displayType: 'merchant', positionBucket: 'unknown',
  })));
}

export async function recordProductClick(input: ProductClickInput) {
  const siteId = input.siteId.trim();
  const productUrl = input.productUrl?.trim() ?? '';
  const categoryName = input.categoryName?.trim() ?? '';
  const name = input.name?.trim() ?? '';
  if (!siteId || !input.visitorId) return { recorded: false };
  if (!productUrl && (!categoryName || !name)) return { recorded: false as const };
  const result = await getPool().query(
    `
        SELECT shop_products.id
        FROM shop_products
        INNER JOIN shop_sites ON shop_sites.id = shop_products.site_id
        WHERE shop_products.site_id = $1
          AND shop_sites.status = 'online'
          AND shop_sites.type = 'cardShop'
          AND shop_products.active = true
          AND (
            ($2 <> '' AND shop_products.product_url = $2)
            OR ($2 = '' AND shop_products.category_name = $3 AND shop_products.name = $4)
          )
        ORDER BY shop_products.refreshed_at DESC, shop_products.name ASC
        LIMIT 1
    `,
    [siteId, productUrl, categoryName, name],
  );
  if (!result.rows[0]) return { recorded: false };
  return recordVisitorProductEvents([{
    productId: String(result.rows[0].id), visitorId: input.visitorId,
    eventType: 'click', scene: 'merchant', displayType: 'merchant', positionBucket: 'unknown',
  }]);
}

export async function recordProductMetric(input: ProductMetricInput) {
  return recordProductMetrics([input]);
}

export async function recordProductMetrics(inputs: ProductMetricInput[]) {
  const valid = inputs.filter(input => /^[0-9a-f]{32}$/i.test(input.productId)
    && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(input.visitorId)
    && ['impression', 'click'].includes(input.eventType)
    && ['default', 'search'].includes(input.scene)
    && ['normal', 'partner', 'support', 'favorite'].includes(input.displayType)
    && ['1-5', '6-20', '21+'].includes(input.positionBucket));
  if (!valid.length) return { recorded: false };
  return recordVisitorProductEvents(valid);
}

export async function loadPopularSearchTerms(limit = 10) {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(30, Math.floor(limit))) : 10;
  const result = await getPool().query(`
    SELECT term FROM shop_popular_search_terms ORDER BY position ASC LIMIT $1
  `, [safeLimit]);
  const terms = result.rows.map(row => String(row.term));
  return { terms, normalizedTerms: terms.map(normalizeSearchText) };
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
  modelOrganization: string | null;
  modelFamily: string | null;
  gatewayPath?: string | null;
  shopPath?: string | null;
  score: number;
  fetchedAt: string;
};

export type PublicOfficialPriceCatalogRow = {
  appSlug: string;
  planSlug: string;
  appName: string;
  planName: string;
  displayName: string;
  urlSlug: string;
  isDefault: boolean;
  displayOrder: number;
};

function mapOfficialPriceRow(row: Record<string, unknown>): PublicOfficialPriceRow {
  return {
    appSlug: String(row.app_slug),
    planSlug: String(row.plan_slug),
    appName: String(row.app_name),
    planName: String(row.plan_name),
    displayName: String(row.display_name),
    urlSlug: String(row.url_slug),
    ...officialPlanIdentity(String(row.app_slug), String(row.plan_slug)),
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
    fetchedAt: isoTimestamp(row.fetched_at) ?? '',
  };
}

export async function loadOfficialPriceCatalog(): Promise<PublicOfficialPriceCatalogRow[]> {
  const result = await getPool().query(`
    SELECT DISTINCT ON (app_slug, plan_slug)
      app_slug,
      plan_slug,
      app_name,
      plan_name,
      display_name,
      url_slug,
      is_default,
      display_order
    FROM official_prices
    WHERE trim(url_slug) <> ''
      AND lower(trim(url_slug)) NOT IN ('default', 'official-price')
      AND trim(display_name) <> ''
    ORDER BY app_slug, plan_slug, display_order ASC
  `);
  return result.rows.filter(row => !isRetiredOfficialPrice(String(row.app_slug))).map(row => ({
    appSlug: String(row.app_slug),
    planSlug: String(row.plan_slug),
    appName: String(row.app_name),
    planName: String(row.plan_name),
    displayName: String(row.display_name),
    urlSlug: String(row.url_slug),
    ...officialPlanIdentity(String(row.app_slug), String(row.plan_slug)),
    isDefault: Boolean(row.is_default),
    displayOrder: Number(row.display_order) || 0,
  }));
}

export async function loadOfficialPricesByUrlSlug(urlSlug: string): Promise<PublicOfficialPriceRow[]> {
  const normalizedSlug = urlSlug.trim().toLowerCase();
  const result = await getPool().query(`
    SELECT app_slug, plan_slug, app_name, plan_name, display_name, url_slug, is_default, display_order, country_code, country_label, currency_code, price_text, price_value, cny_price, usd_price, rub_price, fetched_at
    FROM official_prices
    WHERE lower(trim(url_slug)) = ANY($1::text[])
    ORDER BY cny_price ASC
  `, [officialPriceStorageSlugs(normalizedSlug)]);
  return result.rows.filter(row => !isRetiredOfficialPrice(String(row.app_slug))).map(mapOfficialPriceRow);
}

/** Read the three lowest regional prices and the recorded U.S. baseline per subscription. */
export async function loadOfficialPriceHighlights(): Promise<PublicOfficialPriceRow[]> {
  const result = await getPool().query(`
    WITH ranked_prices AS (
      SELECT app_slug, plan_slug, app_name, plan_name, display_name, url_slug,
        is_default, display_order, country_code, country_label, currency_code,
        price_text, price_value, cny_price, usd_price, rub_price, fetched_at,
        ROW_NUMBER() OVER (PARTITION BY app_slug, plan_slug ORDER BY cny_price ASC, country_code ASC) AS position
      FROM official_prices
      WHERE trim(url_slug) <> ''
        AND lower(trim(url_slug)) NOT IN ('default', 'official-price')
        AND trim(display_name) <> ''
    )
    SELECT app_slug, plan_slug, app_name, plan_name, display_name, url_slug,
      is_default, display_order, country_code, country_label, currency_code,
      price_text, price_value, cny_price, usd_price, rub_price, fetched_at
    FROM ranked_prices WHERE position <= 3 OR country_code = 'US'
    ORDER BY display_order ASC, app_slug ASC, plan_slug ASC, cny_price ASC, country_code ASC
  `);
  return result.rows.filter(row => !isRetiredOfficialPrice(String(row.app_slug))).map(mapOfficialPriceRow);
}

export async function loadOfficialPrices(): Promise<PublicOfficialPriceRow[]> {
  const db = getPool();
  const result = await db.query(`
    SELECT app_slug, plan_slug, app_name, plan_name, display_name, url_slug, is_default, display_order, country_code, country_label, currency_code, price_text, price_value, cny_price, usd_price, rub_price, fetched_at
    FROM official_prices
    ORDER BY display_order ASC, cny_price ASC
  `);
  return result.rows.filter(row => !isRetiredOfficialPrice(String(row.app_slug))).map(mapOfficialPriceRow);
}

export async function loadModelLeaderboardTaskSlugs(): Promise<string[]> {
  const result = await getPool().query(`
    SELECT task_slug
    FROM model_leaderboards
    GROUP BY task_slug
    ORDER BY
      CASE task_slug
        WHEN 'coding' THEN 1
        WHEN 'creative-writing' THEN 2
        WHEN 'math' THEN 3
        WHEN 'text-to-image' THEN 4
        ELSE 999
      END ASC,
      task_slug ASC
  `);
  return result.rows.map(row => String(row.task_slug));
}

export async function loadModelLeaderboardRowsForTask(taskSlug: string, options: PublicListLimitOptions = {}): Promise<PublicModelLeaderboardRow[]> {
  const normalizedTaskSlug = taskSlug.trim().toLowerCase();
  const limit = safeListLimit(options.limit);
  const result = await getPool().query(`
    SELECT
      task_slug,
      source_name,
      source_url,
      source_group_slug,
      source_board_slug,
      rank,
      model_name,
      model_organization,
      model_family,
      score,
      fetched_at
    FROM model_leaderboards
    WHERE lower(trim(task_slug)) = $1
    ORDER BY rank ASC
    ${limit ? 'LIMIT $2' : ''}
  `, limit ? [normalizedTaskSlug, limit] : [normalizedTaskSlug]);
  return attachLeaderboardNavigation(result.rows.map(mapModelLeaderboardRow));
}

export async function loadModelLeaderboardRowsForTaskPage(taskSlug: string, options: PublicListLimitOptions = {}) {
  const normalizedTaskSlug = taskSlug.trim().toLowerCase();
  const limit = safeListLimit(options.limit);
  const result = await getPool().query(`
    SELECT
      task_slug,
      source_name,
      source_url,
      source_group_slug,
      source_board_slug,
      rank,
      model_name,
      model_organization,
      model_family,
      score,
      fetched_at,
      COUNT(*) OVER()::INTEGER AS total_count,
      MAX(fetched_at) OVER() AS latest_fetched_at
    FROM model_leaderboards
    WHERE lower(trim(task_slug)) = $1
    ORDER BY rank ASC
    ${limit ? 'LIMIT $2' : ''}
  `, limit ? [normalizedTaskSlug, limit] : [normalizedTaskSlug]);
  const firstRow = result.rows[0] ?? {};
  return {
    rows: await attachLeaderboardNavigation(result.rows.map(mapModelLeaderboardRow)),
    totalCount: Number(firstRow.total_count) || 0,
    latestFetchedAt: isoTimestamp(firstRow.latest_fetched_at),
  };
}

function mapModelLeaderboardRow(row: Record<string, unknown>): PublicModelLeaderboardRow {
  return {
    taskSlug: String(row.task_slug),
    sourceName: String(row.source_name),
    sourceUrl: String(row.source_url),
    sourceGroupSlug: String(row.source_group_slug),
    sourceBoardSlug: String(row.source_board_slug),
    rank: Number(row.rank),
    modelName: String(row.model_name),
    modelOrganization: row.model_organization ? String(row.model_organization) : null,
    modelFamily: row.model_family ? String(row.model_family) : null,
    score: Number(row.score),
    fetchedAt: isoTimestamp(row.fetched_at) ?? '',
  };
}

async function attachLeaderboardNavigation(rows: PublicModelLeaderboardRow[]) {
  if (!rows.length) return rows;
  const result = await getPool().query(`
    SELECT ARRAY(SELECT DISTINCT unnest(CASE WHEN price_count > 0 THEN recent_model_families ELSE model_families END) FROM gateway_sites WHERE status = 'online' AND type = 'gateway') AS gateway_families,
      ARRAY(SELECT DISTINCT product.auto_category FROM shop_products product
        JOIN shop_sites site ON site.id = product.site_id
        WHERE product.active = true AND site.status = 'online' AND site.type = 'cardShop') AS shop_categories
  `);
  const available = result.rows[0] ?? {};
  const navigation = createFamilyNavigation(available.gateway_families ?? [], available.shop_categories ?? []);
  return rows.map(row => ({ ...row, ...navigation(row.modelFamily) }));
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
      model_organization,
      model_family,
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
  return attachLeaderboardNavigation(result.rows.map(mapModelLeaderboardRow));
}

export type PublicOfficialPriceStats = { productCount: number; regionCount: number };
export async function loadOfficialPriceStats(): Promise<PublicOfficialPriceStats> {
  const result = await getPool().query(`
    SELECT COUNT(DISTINCT (app_slug, plan_slug)) AS product_count,
      COUNT(DISTINCT NULLIF(upper(trim(country_code)), '')) AS region_count
    FROM official_prices
    WHERE trim(url_slug) <> '' AND lower(trim(url_slug)) NOT IN ('default', 'official-price')
      AND trim(display_name) <> '' AND app_slug <> 'copilot'
  `);
  return { productCount: Number(result.rows[0]?.product_count) || 0, regionCount: Number(result.rows[0]?.region_count) || 0 };
}

export type PublicModelLeaderboardStats = { scenarioCount: number; modelCount: number };
export async function loadModelLeaderboardStats(): Promise<PublicModelLeaderboardStats> {
  const result = await getPool().query(`
    SELECT COUNT(DISTINCT task_slug) AS scenario_count,
      COUNT(DISTINCT NULLIF(trim(model_name), '')) AS model_count
    FROM model_leaderboards
    WHERE task_slug IN ('coding', 'creative-writing', 'math', 'text-to-image')
  `);
  return { scenarioCount: Number(result.rows[0]?.scenario_count) || 0, modelCount: Number(result.rows[0]?.model_count) || 0 };
}


export async function loadShopPlatformOptions(): Promise<string[]> {
  const result = await getPool().query("SELECT DISTINCT family FROM shop_sites WHERE status = 'online' AND type = 'cardShop'");
  return [...new Set(result.rows.map(row => shopPlatformName(row.family)))].sort();
}
