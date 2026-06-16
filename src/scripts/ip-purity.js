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
    if (loading) ui.status.textContent = '正在检测，请稍候...';
  }

  function clearError() {
    ui.error.textContent = '';
    ui.error.classList.add('hidden');
  }

  function showError(message) {
    ui.error.textContent = message;
    ui.error.classList.remove('hidden');
  }

  function setEmptyState(statusText = '还没有检测结果。') {
    ui.score.textContent = '--';
    ui.badge.textContent = '等待检测';
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
    ui.signals.innerHTML = '<p class="text-sm text-base-content/55">等待检测后显示风险信号。</p>';
    ui.sources.innerHTML = '<p class="text-sm text-base-content/55">等待检测后显示不同来源返回的结果摘要。</p>';
  }

  function validateIpv4(value) {
    const input = String(value || '').trim();
    if (!input) return '';
    if (input.includes(':')) return '当前只支持 IPv4 纯净度检测，IPv6 暂不支持。';
    if (!IPV4_PATTERN.test(input)) return 'IP 格式不正确，请输入正确地址，例如 8.8.8.8。';
    const segments = input.split('.').map(Number);
    if (segments.some(number => !Number.isInteger(number) || number < 0 || number > 255)) {
      return 'IP 格式不正确，请输入正确地址，例如 8.8.8.8。';
    }
    return '';
  }

  function renderReport(payload) {
    latestPayload = payload;
    ui.score.textContent = String(payload.score);
    ui.badge.textContent = {
      clean: '高纯净',
      watch: '可用但需留意',
      risk: '风险偏高',
      blocked: '高风险',
    }[payload.riskLevel] || payload.riskLevel;
    ui.badge.className = `badge mt-3 w-fit ${badgeClassName(payload.riskLevel)}`;
    ui.ip.textContent = payload.ip;
    ui.checkedAt.textContent = formatTime(payload.checkedAt);
    ui.summary.textContent = payload.summary;
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
      emptyCaption: '暂无位置坐标。',
    });
  }

  function clearMap() {
    latestPayload = null;
    if (!ui.map || !ui.mapCaption) return;
    ui.map.innerHTML = `
      <div class="ip-purity-map-empty">
        <strong>暂无坐标</strong>
        <p>这次没有拿到位置坐标。</p>
      </div>
    `;
    ui.mapCaption.textContent = '暂无位置坐标。';
    clearIpLocationMap(ui.map);
  }

  function renderSignalCard(signal) {
    return `
      <article class="ip-purity-signal-card">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h4 class="font-semibold text-base-content">${escapeHtml(signal.label)}</h4>
            <p class="mt-2 text-sm leading-6 text-base-content/72">${escapeHtml(signal.detail)}</p>
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
        <p class="mt-1 text-sm leading-6 text-base-content/72">${escapeHtml(source.summary)}</p>
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
    if (verdict === 'clean') return '正常';
    if (verdict === 'risk') return '风险';
    return '未知';
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
        throw new Error(payload?.message || '检测失败，请稍后重试。');
      }
      renderReport(payload);
      ui.status.textContent = `检测完成：${payload.ip}`;
    } catch (error) {
      setEmptyState('检测失败。');
      showError(error instanceof Error ? error.message : '检测失败，请稍后重试。');
      ui.status.textContent = '检测失败。';
    } finally {
      setLoading(false);
    }
  }

  async function detectCurrentIpv4() {
    clearError();
    setLoading(true);
    try {
      ui.status.textContent = '正在识别当前 IP...';
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
      setEmptyState('当前 IP 识别失败。');
      showError(error instanceof Error ? error.message : '当前 IP 识别失败。');
      ui.status.textContent = '当前 IP 识别失败。';
    } finally {
      setLoading(false);
    }
  }

  function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return new Intl.DateTimeFormat('zh-CN', {
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
      setEmptyState('输入校验失败。');
      showError(validationMessage);
      ui.status.textContent = '请输入有效 IP。';
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
    ui.status.textContent = '已清空输入。';
  });

  setEmptyState();
  void detectCurrentIpv4();
})();
