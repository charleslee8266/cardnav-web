/** Refresh dates use machine timestamps and one Beijing-time presentation policy. */
export function refreshTimestamp(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : 0;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
}

export function relativeUpdateTime(timestamp: number, locale: string, now = Date.now()) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '—';
  const elapsed = Math.max(0, now - timestamp);
  if (elapsed > 3 * 86400000) {
    const year = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Shanghai' });
    return new Intl.DateTimeFormat(locale || 'zh', {
      ...(year.format(timestamp) !== year.format(now) ? { year: 'numeric' as const } : {}),
      month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai',
    }).format(timestamp);
  }
  const [unit, divisor]: [Intl.RelativeTimeFormatUnit, number] = elapsed >= 86400000 ? ['day', 86400000] : elapsed >= 3600000 ? ['hour', 3600000] : ['minute', 60000];
  return new Intl.RelativeTimeFormat(locale || 'zh', { numeric: 'always' }).format(-Math.floor(elapsed / divisor), unit);
}

export function exactRefreshTime(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  return `${new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Shanghai' }).format(timestamp)} (UTC+8)`;
}

export function updateRefreshTime(time: HTMLTimeElement, now = Date.now()) {
  const timestamp = refreshTimestamp(Number(time.dataset.refreshTime));
  if (!timestamp) return;
  time.textContent = relativeUpdateTime(timestamp, time.lang || document.documentElement.lang, now);
  time.dateTime = new Date(timestamp).toISOString();
  time.title = exactRefreshTime(timestamp);
}

export function createRelativeTime(timestamp: number, locale = document.documentElement.lang) {
  const time = document.createElement('time');
  time.className = 'data-relative-time';
  time.dataset.refreshTime = String(refreshTimestamp(timestamp));
  time.lang = locale;
  time.textContent = '—';
  updateRefreshTime(time);
  return time;
}
