import { enqueueReport } from './metric-reports.js';

/** Share product click reporting between the market and merchant catalog. */
export function trackProductClicks(tracker) {
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('[data-product-click-id]') : null;
    if (!(target instanceof HTMLElement)) return;
    const metricRow = target.closest('[data-product-metric-id]');
    if (metricRow instanceof HTMLElement) {
      void tracker.click(metricRow);
      return;
    }
    const productId = target.dataset.productClickId || '';
    if (tracker.markClick(productId)) {
      enqueueReport('/api/product-clicks', { productId, visitorId: tracker.visitorId });
    }
  });
}
