/** Shared presentation for links between the public data pages. */
export const relatedLinkClass = 'data-crosslink inline-flex';
export const relatedLinkArrow = '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>';
export function createRelatedLink({ href, label, id, className = '', target, attributes = {} }: { href: string; label: string; id?: string; className?: string; target?: string; attributes?: Record<string, string> }) {
  const link = document.createElement('a');
  link.href = href; link.className = `${relatedLinkClass} ${className} ${!href || href === "#" ? "hidden" : ""}`.trim();
  if (id) link.id = id;
  if (target) { link.target = target; if (target === '_blank') link.rel = 'noopener noreferrer'; }
  for (const [key, value] of Object.entries(attributes)) link.setAttribute(key, value);
  const text = document.createElement('span'); text.textContent = label;
  link.append(text); link.insertAdjacentHTML('beforeend', relatedLinkArrow);
  return link;
}
