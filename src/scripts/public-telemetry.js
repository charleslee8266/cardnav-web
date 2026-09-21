/*
文件说明: 统一承载公开站 Umami telemetry 的上下文、手动事件和站内外链接点击处理。
*/

function telemetryContext(sourceElement) {
  return {
    'source-page': window.location.pathname,
    'source-page-type': document.body?.dataset.sourcePageType || 'unknown',
    'source-block': sourceElement?.closest('[data-telemetry-block]')?.getAttribute('data-telemetry-block') || document.body?.dataset.telemetryBlock,
  };
}

function sendTelemetry(...args) {
  try {
    if (typeof window.umami?.track !== 'function') return;
    void Promise.resolve(window.umami.track(...args)).catch(() => {});
  } catch {
    // 统计失败不影响页面交互。
  }
}

window.CardNavTelemetry = {
  context: telemetryContext,
  track(eventName, eventData = {}, sourceElement) {
    const context = telemetryContext(sourceElement);
    sendTelemetry(eventName, { ...context, ...eventData,
      'source-page': context['source-page'],
      'source-page-type': context['source-page-type'],
    });
  },
};

function trackPageview() {
  sendTelemetry();
}

function initPageviewTelemetry() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trackPageview, { once: true });
    return;
  }
  trackPageview();
}

function datasetKeyToEventKey(key) {
  return key
    .replace(/^umamiEvent/u, '')
    .replace(/^[A-Z]/u, value => value.toLowerCase())
    .replace(/[A-Z]/gu, value => `-${value.toLowerCase()}`);
}

function eventDataFromElement(target, url, isExternal) {
  const context = telemetryContext(target);
  const data = { ...context };
  Object.entries(target.dataset).forEach(([key, value]) => {
    if (!key.startsWith('umamiEvent') || key === 'umamiEvent') return;
    data[datasetKeyToEventKey(key)] = value;
  });

  const linkName = target.dataset.umamiEventName || target.textContent?.trim().slice(0, 120) || '';
  if (linkName) data.name = linkName;
  if (url && isExternal) {
    data.url = url.toString();
    data['link-type'] = data['link-type'] || 'external';
  } else if (url) {
    data.url = `${url.pathname}${url.search}${url.hash}`;
    data['target-page'] = data.url;
    data['link-type'] = data['link-type'] || 'internal';
  }
  return data;
}

function initClickTelemetry() {
  const trackClick = event => {
    if (event.type === 'auxclick' && event.button !== 1) return;
    const target = event.target instanceof Element
      ? event.target.closest('[data-umami-event], a[href]')
      : null;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-open-support]')) return;

    const isAnchor = target instanceof HTMLAnchorElement;
    if (event.type === 'auxclick' && !isAnchor) return;
    let url = null;
    if (isAnchor) {
      try {
        url = new URL(target.href, window.location.href);
      } catch {
        return;
      }
      if (!['http:', 'https:'].includes(url.protocol)) return;
    }

    const isExternal = Boolean(url && url.origin !== window.location.origin);
    const eventName = url
      ? (isExternal ? 'external-link-click' : 'internal-link-click')
      : target.dataset.umamiEvent;
    if (!eventName) return;

    window.CardNavTelemetry.track(eventName, eventDataFromElement(target, url, isExternal));
  };
  document.addEventListener('click', trackClick, true);
  document.addEventListener('auxclick', trackClick, true);
}

initClickTelemetry();
initPageviewTelemetry();
