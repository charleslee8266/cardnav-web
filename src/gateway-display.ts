/**
 * 文件说明: Gateway 列表与详情页共用的价格、分数和支付方式展示 helper。
 */

export function formatPrice(value: number | null) {
  return value === null || !Number.isFinite(value) ? '-' : value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export function formatPositiveScore(value: number | null) {
  return value === null || !Number.isFinite(value) || value <= 0 ? '-' : value.toFixed(2);
}

export function formatAvailabilityPercent(value: number) {
  if (!Number.isFinite(value) || value < 0) return '-';
  return `${Math.min(100, value).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

export function formatLatencySeconds(value: number | null) {
  if (value === null || !Number.isFinite(value) || value < 0) return '-';
  return `${(value / 1000).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} s`;
}

export function displayPriceUnit(unit: string) {
  if (unit === '1M_tokens' || unit === 'quota_ratio') return '$ / 1M tokens';
  if (unit === 'call') return 'per call';
  return unit || '-';
}

export function uniqueLabels(items: string[], limit?: number) {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const item of items) {
    const label = item.trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
    if (limit && labels.length >= limit) break;
  }
  return labels;
}

export function shortList(items: string[], limit = 10) {
  return items.slice(0, limit);
}

export function paymentLabel(key: string, labels: Record<string, string>) {
  return labels[key] || key;
}

export function paymentIcon(key: string): { src: string | null; fallback: string } {
  const icons: Record<string, { src: string; fallback: string }> = {
    alipay: { src: '/assets/payment-icons/alipay.svg', fallback: 'A' },
    wechat: { src: '/assets/payment-icons/wechat.svg', fallback: 'W' },
    visa: { src: '/assets/payment-icons/visa.svg', fallback: 'V' },
    mastercard: { src: '/assets/payment-icons/mastercard.svg', fallback: 'M' },
    stripe: { src: '/assets/payment-icons/stripe.svg', fallback: 'S' },
    paypal: { src: '/assets/payment-icons/paypal.svg', fallback: 'P' },
    tether: { src: '/assets/payment-icons/tether.svg', fallback: 'T' },
    bitcoin: { src: '/assets/payment-icons/bitcoin.svg', fallback: 'B' },
    applepay: { src: '/assets/payment-icons/applepay.svg', fallback: 'A' },
    googlepay: { src: '/assets/payment-icons/googlepay.svg', fallback: 'G' },
  };
  return icons[key] || { src: null, fallback: key.trim().slice(0, 1).toUpperCase() };
}

export function collectFilterOptions(items: string[][]) {
  return uniqueLabels(items.flat()).sort((a, b) => a.localeCompare(b));
}