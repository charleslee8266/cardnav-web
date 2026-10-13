/** Canonical public routes; callers apply locale prefixes once. */
export function gatewayProviderSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
export function gatewayFamilyPath(family: string) {
  return `/llm-gateway?${new URLSearchParams({ family: gatewayProviderSlug(family) })}`;
}
export function gatewayModelPath(modelId: string, prefix = '/llm-gateway/models') {
  return `${prefix}/${encodeURIComponent(modelId)}`;
}
/** Read the original URL segment: framework params may already decode literal percent signs. */
export function gatewayModelIdFromPathname(pathname: string, suffix = ''): string | null {
  const segment = pathname.replace(/\/$/, '').split('/').at(-1) || '';
  if (suffix && !segment.endsWith(suffix)) return null;
  const encoded = suffix ? segment.slice(0, -suffix.length) : segment;
  try { return decodeURIComponent(encoded); } catch { return null; }
}

export function shopCategoryPath(slug: string) { return `/shops/${encodeURIComponent(slug)}`; }
export function officialPricePathname(slug: string) { return `/official-price/${encodeURIComponent(slug)}`; }

export function leaderboardFamilyPath(family: string, pathname = '/model-leaderboard') {
  return `${pathname}?${new URLSearchParams({ family: gatewayProviderSlug(family) })}`;
}
