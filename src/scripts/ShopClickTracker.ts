/*
文件说明: 为实际外跳记录匿名会话、已应用筛选上下文及每次点击的展示快照。
*/
import type { ShopClickFilters } from '../shop-click.js';
import { enqueueReport, flushReports } from './metric-reports.js';
export class ShopClickTracker {
  private contextId = crypto.randomUUID();
  private filters: ShopClickFilters = {};
  private filterKey = '{}';
  private sessionId = crypto.randomUUID();
  private lastSeen = 0;
  constructor(private visitorId: string) { this.session(); }

  updateContext(filters: ShopClickFilters) {
    const normalized = Object.fromEntries(Object.entries(filters).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key, Array.isArray(value) ? [...value].sort() : value]));
    const key = JSON.stringify(normalized);
    if (key !== this.filterKey) this.contextId = crypto.randomUUID();
    this.filterKey = key;
    this.filters = normalized;
  }

  private session() {
    const now = Date.now();
    if (now - this.lastSeen >= 30 * 60_000) this.sessionId = crypto.randomUUID();
    this.lastSeen = now;
    try {
      const stored = JSON.parse(localStorage.getItem('cardnav.clickSession') || 'null');
      if (stored && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(stored.id) && now >= stored.lastSeen && now - stored.lastSeen < 30 * 60_000) this.sessionId = stored.id;
      else this.sessionId = crypto.randomUUID();
      localStorage.setItem('cardnav.clickSession', JSON.stringify({ id: this.sessionId, lastSeen: now }));
    } catch { /* 禁用存储时当前页面复用会话。 */ }
    return this.sessionId;
  }

  click(target: HTMLElement) {
    const row = target.closest<HTMLElement>('[data-product-metric-id], .merchant-row, .flat-product-row');
    const data = row?.dataset || target.dataset;
    const productId = target.dataset.productClickId;
    const pinReason = data.pinKind || '';
    const isPartner = data.clickPartner === '1' || data.sponsor === '1';
    const isSupporter = data.clickSupporter === '1' || Number(data.supportTotalCents) > 0;
    enqueueReport('/api/product-clicks', {
      eventId: crypto.randomUUID(), visitorId: this.visitorId, sessionId: this.session(), contextId: this.contextId,
      occurredAt: new Date().toISOString(), sourcePage: location.pathname, filters: this.filters,
      ...(productId ? { productId } : { siteId: target.dataset.merchantClickId }),
      position: Number(data.clickPosition) || null,
      region: pinReason ? 'pinned' : row ? 'normal' : 'detail', pinReason,
      isPartner, isSupporter, riskDialogShown: target.dataset.productRiskShown === '1',
      displayType: data.productMetricDisplayType || (isPartner ? 'partner' : isSupporter ? 'support' : 'normal'),
    });
    flushReports();
  }
}
