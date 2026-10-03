import { getProviderIcon } from './provider-icons.js';
import { gatewayProviderSlug, quickPlanProducts, productIconPath } from './shop-plan-search.js';

/** Shared presentation for stored scores and update times. */
export function scorePresentation(value: number | null | undefined, maximum = 100) {
  const number = Number(value);
  const valid = value !== null && value !== undefined && Number.isFinite(number);
  return { text: valid ? number.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—', fill: valid ? Math.max(0, Math.min(100, number / Math.max(1, maximum) * 100)) : 0 };
}
export { relativeUpdateTime, createRelativeTime } from './refresh-time.js';
export function createScoreDisplay(value: number | null | undefined) {
  const score = scorePresentation(value);
  const span = document.createElement('span');
  span.className = 'data-score';
  span.textContent = score.text;
  if (value !== null && value !== undefined) span.title = String(value);
  const meter = document.createElement('span');
  meter.className = 'data-score-meter';
  meter.setAttribute('aria-hidden', 'true');
  const fill = document.createElement('i');
  fill.style.setProperty('--score-fill', `${score.fill}%`);
  meter.append(fill); span.append(meter);
  return span;
}
/** Reuse the product registry so provider marks have one asset source. */
export function providerPresentation(name: string) {
  const slug = gatewayProviderSlug(name);
  const product = quickPlanProducts.find(item => item.gateway?.id === slug);
  return { name, icon: product?.icon ? productIconPath(product.icon) : getProviderIcon(name) || '', monochrome: product?.monochrome ?? false };
}
export function createProviderLabel(name: string) {
  const provider = providerPresentation(name);
  const label = document.createElement('span');
  label.className = 'data-provider';
  if (provider.icon) {
    const icon = document.createElement('img');
    icon.src = provider.icon; icon.alt = ''; icon.width = 14; icon.height = 14;
    if (provider.monochrome) icon.className = 'data-provider-mono';
    label.append(icon);
  }
  label.append(document.createTextNode(provider.name));
  return label;
}
