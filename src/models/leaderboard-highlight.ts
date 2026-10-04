import { gatewayProviderSlug } from './routes.js';
/** Selected families, providers and the keyword form a union; ranks and rows stay intact. */
export function matchesLeaderboardHighlight(model: { modelName: string; modelFamily: string | null; modelOrganization?: string | null }, family: string | string[], query: string, providers: string[] = []) {
  const families = (Array.isArray(family) ? family : [family]).filter(Boolean).map(gatewayProviderSlug);
  const keyword = query.trim().toLocaleLowerCase();
  return families.includes(gatewayProviderSlug(model.modelFamily || ''))
    || providers.includes(gatewayProviderSlug(model.modelOrganization || ''))
    || Boolean(keyword && model.modelName.toLocaleLowerCase().includes(keyword));
}
export function leaderboardHighlightPath(pathname: string, family: string | string[], query: string, providers: string[] = []) {
  const params = new URLSearchParams();
  for (const value of (Array.isArray(family) ? family : [family]).filter(Boolean)) params.append('family', value);
  for (const value of providers) params.append('provider', value);
  if (query.trim()) params.set('q', query.trim());
  return `${pathname}${params.size ? `?${params}` : ''}`;
}
