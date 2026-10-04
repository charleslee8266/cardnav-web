import { gatewayProviderSlug } from './routes.js';
import { modelFamilyPresentation } from '../data-display.js';

const visibleFamilyLimit = 10;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

function familyLabel(name: string, selectScope?: string) {
  const family = modelFamilyPresentation(name);
  const icon = family.icon ? `<img src="${escapeHtml(family.icon)}" alt="" width="14" height="14"${family.monochrome ? ' class="data-provider-mono"' : ''}>` : '';
  const content = `${icon}${escapeHtml(family.name)}`;
  return selectScope ? `<button type="button" class="data-provider model-family-select" data-select-family="${escapeHtml(gatewayProviderSlug(name))}" data-family-scope="${escapeHtml(selectScope)}">${content}</button>` : `<span class="data-provider">${content}</span>`;
}

/** The stored list is already classified and ordered by the worker. */
export function renderModelFamilyList(families: readonly string[], label: string, selectScope?: string): string {
  if (!families.length) return '<span class="text-base-content/35">-</span>';
  const visible = families.slice(0, visibleFamilyLimit);
  const remaining = families.slice(visibleFamilyLimit);
  const more = remaining.length
    ? `<button type="button" class="model-family-more" data-inline-help aria-label="${escapeHtml(label)} +${remaining.length}">+${remaining.length}<template data-tip-content><div class="model-family-tooltip-list">${remaining.map(name => familyLabel(name, selectScope)).join('')}</div></template></button>`
    : '';
  return `<div class="model-family-list">${visible.map(name => familyLabel(name, selectScope)).join('')}${more}</div>`;
}
