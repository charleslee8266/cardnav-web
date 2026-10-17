/** Canonical merchant detail paths, shared by server and browser links. */
export function shopDetailPath(slug: string) {
  return `/market/shop/${encodeURIComponent(slug)}`;
}
