export interface SeoInput {
  baseUrl: string;
  pathname: string;
  title: string;
  description: string;
  imagePath: string;
  type: 'website' | 'webpage';
  noindex?: boolean;
}

export function normalizeSiteUrl(input: string) {
  return input.trim().replace(/\/+$/, '');
}

function resolveUrl(baseUrl: string, pathname: string) {
  return new URL(pathname, `${normalizeSiteUrl(baseUrl)}/`).toString();
}

export function buildSeoContext(input: SeoInput) {
  const baseUrl = normalizeSiteUrl(input.baseUrl);
  const canonicalUrl = resolveUrl(baseUrl, input.pathname);
  return {
    pageTitle: input.pathname === '/' ? input.title : `${input.title} - 卡网大全`,
    description: input.description,
    canonicalUrl,
    ogUrl: canonicalUrl,
    ogImageUrl: resolveUrl(baseUrl, input.imagePath),
    robots: input.noindex ? 'noindex,nofollow' : 'index,follow',
    jsonLd:
      input.type === 'website'
        ? {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: '卡网大全',
            url: canonicalUrl,
            description: input.description,
          }
        : {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: input.title,
            url: canonicalUrl,
            description: input.description,
          },
  };
}
