/**
 * 文件说明: 委派监听合作商家主入口与附加入口，外跳前尽力上报独立点击。
 */
import { anonymousVisitorId } from './anonymous-visitor.js';
import { enqueueReport, flushReports } from './metric-reports.js';
function record(event: MouseEvent) {
  if (event.defaultPrevented || (event.type === 'auxclick' ? event.button !== 1 : event.button !== 0)) return;
  const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[data-sponsor-click-id]') : null;
  const section = link?.closest<HTMLElement>('[data-sponsor-page-type][data-placement]');
  if (!link || !section) return;
  try {
    const target = new URL(link.href);
    if (!['http:', 'https:'].includes(target.protocol)) return;
    enqueueReport('/api/sponsor-clicks', {
      eventId: crypto.randomUUID(), occurredAt: new Date().toISOString(), visitorId: anonymousVisitorId(),
      sponsorId: link.dataset.sponsorClickId, placement: section.dataset.placement,
      sourcePage: location.pathname, pageType: section.dataset.sponsorPageType,
      targetUrl: target.href, linkKind: link.dataset.sponsorLinkKind,
    });
    flushReports();
  } catch { /* 统计失败不得影响原始链接或导航。 */ }
}
document.addEventListener('click', record);
document.addEventListener('auxclick', record);
