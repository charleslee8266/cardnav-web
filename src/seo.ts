/**
 * 文件说明: 生成公开页面的 canonical、Open Graph 和结构化数据上下文。
 */
export interface SeoInput {
  baseUrl: string;
  pathname: string;
  title: string;
  description: string;
  imagePath: string;
  type: 'website' | 'webpage' | 'article';
  noindex?: boolean;
  datePublished?: string;
  dateModified?: string;
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
    ogType: input.type === 'article' ? 'article' : 'website',
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
        : input.type === 'article'
          ? {
              '@context': 'https://schema.org',
              '@type': 'Article',
              headline: input.title,
              name: input.title,
              url: canonicalUrl,
              description: input.description,
              datePublished: input.datePublished,
              dateModified: input.dateModified,
              publisher: {
                '@type': 'Organization',
                name: '卡网大全',
                url: baseUrl,
              },
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
