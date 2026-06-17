/*
文件说明: 驱动 IP 纯净度工具页的自动识别、IP 校验、检测请求和结果渲染。
*/
import { clearIpLocationMap, renderIpLocationMap, resizeIpLocationMap } from './ip-location-map.js';

(() => {
  const ui = {
    form: document.querySelector('#ipPurityForm'),
    input: document.querySelector('#ipPurityInput'),
    submit: document.querySelector('#ipPuritySubmit'),
    detectCurrent: document.querySelector('#ipPurityDetectCurrent'),
    clear: document.querySelector('#ipPurityClear'),
    error: document.querySelector('#ipPurityError'),
    status: document.querySelector('#ipPurityStatus'),
    score: document.querySelector('#ipPurityScore'),
    badge: document.querySelector('#ipPurityBadge'),
    ip: document.querySelector('#ipPurityIp'),
    checkedAt: document.querySelector('#ipPurityCheckedAt'),
    summary: document.querySelector('#ipPuritySummary'),
    country: document.querySelector('#ipPurityCountry'),
    region: document.querySelector('#ipPurityRegion'),
    city: document.querySelector('#ipPurityCity'),
    isp: document.querySelector('#ipPurityIsp'),
    org: document.querySelector('#ipPurityOrg'),
    asn: document.querySelector('#ipPurityAsn'),
    networkType: document.querySelector('#ipPurityNetworkType'),
    coordinates: document.querySelector('#ipPurityCoordinates'),
    map: document.querySelector('#ipPurityMap'),
    mapCaption: document.querySelector('#ipPurityMapCaption'),
    signals: document.querySelector('#ipPuritySignals'),
    sources: document.querySelector('#ipPuritySources'),
  };

  if (!ui.form || !ui.input) return;

  const dict = JSON.parse(document.querySelector('#ip-purity-runtime-dict')?.textContent || '{}');
  const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/;
  let latestPayload = null;

  function trackUmamiEvent(eventName, eventData = {}) {
    if (typeof window.umami?.track !== 'function') return;
    window.umami.track(eventName, eventData);
  }

  window.addEventListener('resize', () => {
    if (ui.map) resizeIpLocationMap(ui.map);
  });

  document.addEventListener('themechange', () => {
    if (latestPayload) {
      void renderMap(latestPayload);
    }
  });

  function setLoading(loading) {
    if (ui.submit) ui.submit.disabled = loading;
    if (ui.detectCurrent) ui.detectCurrent.disabled = loading;
    if (loading) ui.status.textContent = dict.status?.loading || 'Checking...';
  }

  function clearError() {
    ui.error.textContent = '';
    ui.error.classList.add('hidden');
  }

  function showError(message) {
    ui.error.textContent = message;
    ui.error.classList.remove('hidden');
  }

  function setEmptyState(statusText = dict.status?.emptySummary || 'No result yet.') {
    ui.score.textContent = '--';
    ui.badge.textContent = dict.status?.waiting || 'Waiting';
    ui.badge.className = 'badge badge-ghost mt-3 w-fit';
    ui.ip.textContent = '--';
    ui.checkedAt.textContent = '--';
    ui.summary.textContent = statusText;
    ui.country.textContent = '--';
    ui.region.textContent = '--';
    ui.city.textContent = '--';
    ui.isp.textContent = '--';
    ui.org.textContent = '--';
    ui.asn.textContent = '--';
    ui.networkType.textContent = '--';
    ui.coordinates.textContent = '--';
    clearMap();
    ui.signals.innerHTML = `<p class="text-sm text-base-content/55">${escapeHtml(dict.status?.waitingSignals || 'Risk signals will appear after checking.')}</p>`;
    ui.sources.innerHTML = `<p class="text-sm text-base-content/55">${escapeHtml(dict.status?.waitingSources || 'Source summaries will appear after checking.')}</p>`;
  }

  function validateIpv4(value) {
    const input = String(value || '').trim();
    if (!input) return '';
    if (input.includes(':')) return renderError('ipv6Unsupported');
    if (!IPV4_PATTERN.test(input)) return renderError('invalidIp');
    const segments = input.split('.').map(Number);
    if (segments.some(number => !Number.isInteger(number) || number < 0 || number > 255)) {
      return renderError('invalidIp');
    }
    return '';
  }

  function renderReport(payload) {
    latestPayload = payload;
    ui.score.textContent = String(payload.score);
    ui.badge.textContent = renderRiskLevel(payload.riskLevel);
    ui.badge.className = `badge mt-3 w-fit ${badgeClassName(payload.riskLevel)}`;
    ui.ip.textContent = payload.ip;
    ui.checkedAt.textContent = formatTime(payload.checkedAt);
    ui.summary.textContent = renderSummary(payload.summaryKey, payload.summaryParams);
    ui.country.textContent = payload.profile.country || '--';
    ui.region.textContent = payload.profile.region || '--';
    ui.city.textContent = payload.profile.city || '--';
    ui.isp.textContent = payload.profile.isp || '--';
    ui.org.textContent = payload.profile.organization || '--';
    ui.asn.textContent = payload.profile.asn || '--';
    ui.networkType.textContent = payload.profile.networkType || '--';
    ui.coordinates.textContent = formatCoordinates(payload.profile.latitude, payload.profile.longitude);
    void renderMap(payload);
    ui.signals.innerHTML = payload.signals.map(renderSignalCard).join('');
    ui.sources.innerHTML = payload.sourceResults.map(renderSourceCard).join('');
  }

  async function renderMap(payload) {
    if (!ui.map || !ui.mapCaption) return;
    await renderIpLocationMap({
      element: ui.map,
      captionElement: ui.mapCaption,
      ip: payload.ip,
      location: {
        countryCode: payload.profile.country || '',
        region: payload.profile.region || '',
        city: payload.profile.city || '',
        latitude: payload.profile.latitude,
        longitude: payload.profile.longitude,
      },
      messages: dict.map || {},
      emptyCaption: dict.map?.noCoordinatesCaption || 'No coordinates.',
    });
  }

  function clearMap() {
    latestPayload = null;
    if (!ui.map || !ui.mapCaption) return;
    ui.map.innerHTML = `
      <div class="ip-purity-map-empty">
        <strong>${escapeHtml(dict.map?.noCoordinatesTitle || 'No coordinates')}</strong>
        <p>${escapeHtml(dict.map?.noCoordinatesDescription || 'No location coordinates were returned.')}</p>
      </div>
    `;
    ui.mapCaption.textContent = dict.map?.noCoordinatesCaption || 'No coordinates.';
    clearIpLocationMap(ui.map);
  }

  function renderSignalCard(signal) {
    return `
      <article class="ip-purity-signal-card">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h4 class="font-semibold text-base-content">${escapeHtml(renderSignalLabel(signal.key))}</h4>
            <p class="mt-2 text-sm leading-6 text-base-content/72">${escapeHtml(renderSignalDetail(signal))}</p>
          </div>
          <span class="badge ${signalBadgeClass(signal.verdict)}">${signalVerdictLabel(signal.verdict)}</span>
        </div>
      </article>
    `;
  }

  function renderSourceCard(source) {
    return `
      <article class="ip-purity-source-card">
        <h4 class="font-semibold text-base-content">${escapeHtml(source.name)}</h4>
        <p class="mt-1 text-sm leading-6 text-base-content/72">${escapeHtml(renderSourceSummary(source))}</p>
      </article>
    `;
  }

  function badgeClassName(riskLevel) {
    if (riskLevel === 'clean') return 'badge-success';
    if (riskLevel === 'watch') return 'badge-info';
    if (riskLevel === 'risk') return 'badge-warning';
    return 'badge-error';
  }

  function signalBadgeClass(verdict) {
    if (verdict === 'clean') return 'badge-success';
    if (verdict === 'risk') return 'badge-error';
    return 'badge-ghost';
  }

  function signalVerdictLabel(verdict) {
    return dict.verdicts?.[verdict] || verdict || 'Unknown';
  }

  function renderError(messageKey) {
    return dict.errors?.[messageKey] || '';
  }

  function renderRiskLevel(riskLevel) {
    return dict.riskLevels?.[riskLevel] || riskLevel || 'Unknown';
  }

  function renderSummary(summaryKey, params = {}) {
    const shortKey = stripPrefix(summaryKey, 'summary.');
    const signalLabels = Array.isArray(params.signalKeys)
      ? params.signalKeys.map(renderSignalLabel).filter(Boolean).join(dict.listSeparator || ', ')
      : '';
    return formatTemplate(dict.summary?.[shortKey] || '', {
      ...params,
      riskLevel: renderRiskLevel(params.riskLevel),
      signals: signalLabels,
    }) || `${params.score ?? '--'}/100`;
  }

  function renderSignalLabel(key) {
    return dict.signals?.[key]?.label || key || '';
  }

  function renderSignalDetail(signal) {
    const signalDict = dict.signals?.[signal.key] || {};
    if (signal.verdict === 'risk') return signalDict.riskDetail || '';
    if (signal.verdict === 'clean') return signalDict.cleanDetail || '';
    return signalDict.unknownDetail || signalDict.cleanDetail || '';
  }

  function renderSourceSummary(source) {
    const shortKey = stripPrefix(source.summaryKey, 'source.');
    const template = dict.source?.[shortKey] || '';
    const params = source.summaryParams || {};
    const values = Array.isArray(params.values)
      ? params.values.join(' / ')
      : '';
    return formatTemplate(template, { ...params, values }) || '-';
  }

  function stripPrefix(value, prefix) {
    const text = String(value || '');
    return text.startsWith(prefix) ? text.slice(prefix.length) : text;
  }

  function formatTemplate(template, params = {}) {
    return String(template || '').replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? ''));
  }

  async function runCheck(ip) {
    clearError();
    setLoading(true);
    try {
      const response = await fetch(`/api/ip-purity/check?ip=${encodeURIComponent(ip)}`, {
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(renderError(payload?.messageKey) || dict.status?.failed || 'Check failed.');
      }
      renderReport(payload);
      ui.status.textContent = formatTemplate(dict.status?.checkCompleted || 'Check completed: {ip}', { ip: payload.ip });
    } catch (error) {
      setEmptyState(dict.status?.failed || 'Check failed.');
      showError(error instanceof Error ? error.message : dict.status?.failed || 'Check failed.');
      ui.status.textContent = dict.status?.failed || 'Check failed.';
    } finally {
      setLoading(false);
    }
  }

  async function detectCurrentIpv4() {
    clearError();
    setLoading(true);
    try {
      ui.status.textContent = dict.status?.identifyingCurrentIp || 'Detecting current IP...';
      const response = await fetch('https://api4.ipify.org?format=json', {
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => null);
      const ip = String(payload?.ip || '').trim();
      const validationMessage = validateIpv4(ip);
      if (validationMessage) {
        throw new Error(validationMessage);
      }
      ui.input.value = ip;
      await runCheck(ip);
    } catch (error) {
      setEmptyState(dict.status?.failed || 'Check failed.');
      showError(error instanceof Error ? error.message : dict.status?.failed || 'Check failed.');
      ui.status.textContent = dict.status?.failed || 'Check failed.';
    } finally {
      setLoading(false);
    }
  }

  function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return new Intl.DateTimeFormat(dict.locale || 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'medium',
    }).format(date);
  }

  function formatCoordinates(latitude, longitude) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '--';
    return `${Number(latitude).toFixed(3)}, ${Number(longitude).toFixed(3)}`;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  ui.form.addEventListener('submit', event => {
    event.preventDefault();
    clearError();
    const ip = ui.input.value.trim();
    const validationMessage = validateIpv4(ip);
    if (validationMessage) {
      setEmptyState(dict.status?.validationFailed || 'Validation failed.');
      showError(validationMessage);
      ui.status.textContent = dict.status?.enterValidIp || 'Enter a valid IP.';
      return;
    }
    if (!ip) {
      trackUmamiEvent('tool-action-click', {
        tool: 'ip-purity',
        action: 'submit-detect-current',
      });
      void detectCurrentIpv4();
      return;
    }
    trackUmamiEvent('tool-action-click', {
      tool: 'ip-purity',
      action: 'submit-check',
      hasInput: '1',
    });
    void runCheck(ip);
  });

  ui.detectCurrent?.addEventListener('click', () => {
    trackUmamiEvent('tool-action-click', {
      tool: 'ip-purity',
      action: 'detect-current-ip',
    });
    void detectCurrentIpv4();
  });

  ui.clear?.addEventListener('click', () => {
    trackUmamiEvent('tool-action-click', {
      tool: 'ip-purity',
      action: 'clear',
    });
    ui.input.value = '';
    clearError();
    setEmptyState();
    ui.status.textContent = dict.status?.cleared || 'Cleared.';
  });

  setEmptyState();
  void detectCurrentIpv4();
})();
