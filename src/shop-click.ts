/*
文件说明: 定义商家跳转点击契约，校验匿名身份、展示快照和白名单筛选条件。
*/
export const shopClickFilterKeys = ['q', 'merchantQ', 'category', 'quickPlanQuery', 'tab', 'platformOnly', 'platform', 'originalCategory', 'merchantPlatform', 'merchantPlatformOnly', 'showSoldOut', 'kind', 'merchantKind', 'matchCategory', 'matchMerchant', 'fuzzy', 'priceMin', 'priceMax', 'productSort', 'merchantSort', 'scopedShopId'] as const;
export type ShopClickFilters = Partial<Record<typeof shopClickFilterKeys[number], string | string[]>>;
export type ShopClickEvent = {
  eventId: string; visitorId: string; sessionId: string; contextId: string;
  occurredAt: string; sourcePage: string; filters: ShopClickFilters;
  productId?: string; siteId?: string; position: number | null;
  region: 'pinned' | 'normal' | 'detail'; pinReason: string;
  isPartner: boolean; isSupporter: boolean; riskDialogShown: boolean;
  displayType: 'normal' | 'partner' | 'support' | 'favorite';
};
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export function parseShopClick(input: Record<string, unknown>): ShopClickEvent | null {
  for (const key of ['eventId', 'visitorId', 'sessionId', 'contextId']) {
    if (typeof input[key] !== 'string' || !uuid.test(input[key])) return null;
  }
  if (typeof input.occurredAt !== 'string' || !Number.isFinite(Date.parse(input.occurredAt))
    || Math.abs(Date.now() - Date.parse(input.occurredAt)) > 86400_000
    || typeof input.sourcePage !== 'string' || !/^\/[^?#]{0,299}$/.test(input.sourcePage)
    || !['pinned', 'normal', 'detail'].includes(String(input.region))
    || !['normal', 'partner', 'support', 'favorite'].includes(String(input.displayType))
    || typeof input.pinReason !== 'string' || input.pinReason.length > 40
    || (input.position !== null && (!Number.isInteger(input.position) || Number(input.position) < 1 || Number(input.position) > 1_000_000))
    || ['isPartner', 'isSupporter', 'riskDialogShown'].some(key => typeof input[key] !== 'boolean')) return null;
  if (input.productId !== undefined ? typeof input.productId !== 'string' || !/^[0-9a-f]{32}$/i.test(input.productId)
    : typeof input.siteId !== 'string' || !input.siteId || input.siteId.length > 100) return null;
  if (!input.filters || typeof input.filters !== 'object' || Array.isArray(input.filters)) return null;
  const filters: ShopClickFilters = {};
  for (const [key, value] of Object.entries(input.filters)) {
    if (!(shopClickFilterKeys as readonly string[]).includes(key)) return null;
    if (typeof value === 'string' ? value.length > 500
      : !Array.isArray(value) || value.length > 50 || value.some(v => typeof v !== 'string' || v.length > 100)) return null;
    filters[key as keyof ShopClickFilters] = value;
  }
  if (JSON.stringify(filters).length > 8000) return null;
  return { ...input, filters } as ShopClickEvent;
}
