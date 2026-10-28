/** 文件说明: 上报中转站详情与外跳的每日访客去重指标。 */
import { enqueueReport } from './metric-reports.js';
import { anonymousVisitorId } from './anonymous-visitor.js';
const id = anonymousVisitorId();
function report(subjectType, subjectId, eventType) {
  if (!subjectId) return;
  enqueueReport('/api/events', { subjectType, subjectId, eventType, visitorId: id });
}

const pageType = document.body.dataset.sourcePageType;
const path = location.pathname.split('/').filter(Boolean);
const gatewayIndex = path.indexOf('llm-gateway');
if (gatewayIndex >= 0 && pageType === 'gateway-detail') {
  report('site', decodeURIComponent(path[gatewayIndex + 1] || ''), 'detail');
} else if (gatewayIndex >= 0 && pageType === 'gateway-model-detail') {
  report('model', decodeURIComponent(path[gatewayIndex + 2] || ''), 'detail');
}

document.addEventListener('click', event => {
  const link = event.target.closest?.('a[data-umami-event-link-type="gateway-site-open"]');
  if (!link) return;
  const slug = link.closest('[data-gateway-site-key]')?.dataset.gatewaySiteKey ||
    (pageType === 'gateway-detail' ? decodeURIComponent(path[gatewayIndex + 1] || '') : '');
  report('site', slug, 'open');
}, { capture: true });
