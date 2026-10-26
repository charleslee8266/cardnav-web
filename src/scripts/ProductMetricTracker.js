/*
 * 文件说明: 观察商品行可见时长，使用持久匿名访客 ID 上报去重曝光。
 */
import { enqueueReport } from './metric-reports.js';
export default class ProductMetricTracker {
  constructor() {
    this.visitorId = this.loadVisitorId();
    this.observedElements = new Set();
    this.timers = new Map();
    this.exposedIds = new Set();
    this.observer = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(entries => {
        entries.forEach(entry => this.onIntersection(entry));
      }, { threshold: [0, 0.5] })
      : null;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.timers.forEach(timer => clearTimeout(timer));
        this.timers.clear();
      } else if (this.observer) {
        this.observedElements.forEach(element => {
          this.observer.unobserve(element);
          this.observer.observe(element);
        });
      }
    });
  }

  loadVisitorId() {
    const key = 'cardnav.visitorId';
    try {
      const stored = localStorage.getItem(key);
      if (stored && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(stored)) return stored;
    } catch { /* 浏览器禁用持久存储时仍可在当前页面上报。 */ }
    const id = crypto.randomUUID();
    try { localStorage.setItem(key, id); } catch { /* 当前页面仍复用该 ID。 */ }
    return id;
  }

  observe(element) {
    if (!this.observer || !element.dataset.productMetricId || this.observedElements.has(element)) return;
    this.observedElements.add(element);
    this.observer.observe(element);
  }

  onIntersection(entry) {
    const element = entry.target;
    clearTimeout(this.timers.get(element));
    this.timers.delete(element);
    const productId = element.dataset.productMetricId;
    if (!productId || document.hidden || !entry.isIntersecting || entry.intersectionRatio < 0.5
      || this.exposedIds.has(productId)) return;
    const timer = setTimeout(() => {
      this.timers.delete(element);
      if (!element.isConnected || element.closest('[hidden]') || document.hidden) return;
      if (this.exposedIds.has(productId)) return;
      this.exposedIds.add(productId);
      this.send('impression', element);
    }, 1000);
    this.timers.set(element, timer);
  }

  send(eventType, element) {
    enqueueReport('/api/product-metrics', {
      productId: element.dataset.productMetricId,
      visitorId: this.visitorId,
      eventType,
      scene: element.dataset.productMetricScene,
      displayType: element.dataset.productMetricDisplayType,
      positionBucket: element.dataset.productMetricPositionBucket,
    });
  }
}
