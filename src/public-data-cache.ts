/**
 * 文件说明: 为公开只读数据提供进程内短时缓存，降低重复数据库查询压力。
 */

const DEFAULT_TTL_MS = 90_000;

type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

const cache = new Map<string, CacheEntry>();

export const publicReadApiCacheControl = 'public, max-age=60, stale-while-revalidate=300';
export const publicHtmlCacheControl = publicReadApiCacheControl;
export const publicDevHtmlCacheControl = 'no-store';
export const publicSitemapCacheControl = 'public, max-age=3600, stale-while-revalidate=86400';
export const publicStaticAssetCacheControl = 'public, max-age=31536000, immutable';
export const publicBrandAssetCacheControl = 'public, max-age=86400, stale-while-revalidate=604800';

export async function withPublicDataCache<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS,
): Promise<T> {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }

  const value = await loader();
  cache.set(key, {
    expiresAt: now + ttlMs,
    value,
  });
  return value;
}

export function clearPublicDataCache(key?: string) {
  if (key) {
    cache.delete(key);
    return;
  }
  cache.clear();
}