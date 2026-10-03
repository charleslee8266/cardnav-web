/** Public hosting labels; framework and custom installations are self-hosted. */
export function shopPlatformName(family: unknown): string {
  const names: Record<string,string> = { 'platform-ldxp': '链动小铺', 'platform-wzyp': '链动小铺', 'platform-16688': '16688', 'platform-catfk': 'CatFK' };
  return names[String(family)] || '';
}
