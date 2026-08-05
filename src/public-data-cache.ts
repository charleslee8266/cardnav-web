/**
 * 文件说明: 集中定义公开站点响应的浏览器缓存和 Cloudflare 缓存 Header。
 */

export const publicReadApiCacheControl = 'public, max-age=0';
export const publicReadApiCloudflareCacheControl = 'public, max-age=60, stale-while-revalidate=86400';
export const publicHtmlCacheControl = 'public, max-age=60, stale-while-revalidate=86400';
export const publicDynamicHtmlCacheControl = 'public, max-age=300, stale-while-revalidate=86400, stale-if-error=86400';
export const publicHomeHtmlCacheControl = publicDynamicHtmlCacheControl;
export const publicStaticHtmlCacheControl = 'public, max-age=3600, stale-while-revalidate=86400, stale-if-error=604800';
export const publicQueryHtmlCacheControl = 'no-store';
export const publicDevHtmlCacheControl = 'no-store';
export const publicSitemapCacheControl = 'public, max-age=3600, stale-while-revalidate=86400';
export const publicStaticAssetCacheControl = 'public, max-age=31536000, immutable';
export const publicBrandAssetCacheControl = 'public, max-age=86400, stale-while-revalidate=86400';
