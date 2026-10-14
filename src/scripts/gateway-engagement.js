import { enqueueReport } from './metric-reports.js';
const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function visitorId() {
  try {
    const prior = localStorage.getItem('cardnav.visitorId');
    if (prior && uuidPattern.test(prior)) return prior;
  } catch { /* Storage may be disabled. */ }
  const next = crypto.randomUUID();
  try { localStorage.setItem('cardnav.visitorId', next); } catch { /* Use this page's ID. */ }
  return next;
}

const id = visitorId();
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
