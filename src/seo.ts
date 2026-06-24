/**
 * 文件说明: 生成公开页面的 canonical、Open Graph 和结构化数据上下文。
 */
import { defaultLocale, localeLabels, supportedLocales, type Locale } from './i18n/config.js';
import { canonicalPath, localizePath } from './i18n/paths.js';
import { getMessages } from './i18n/messages.js';

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
  locale?: Locale;
}

export function normalizeSiteUrl(input: string) {
  return input.trim().replace(/\/+$/, '');
}

function resolveUrl(baseUrl: string, pathname: string) {
  return new URL(pathname, `${normalizeSiteUrl(baseUrl)}/`).toString();
}

export function buildSeoContext(input: SeoInput) {
  const baseUrl = normalizeSiteUrl(input.baseUrl);
  const locale = input.locale ?? defaultLocale;
  const messages = getMessages(locale);
  const canonicalUrl = resolveUrl(baseUrl, canonicalPath(input.pathname, locale));
  const alternateUrls = supportedLocales.map(itemLocale => ({
    locale: itemLocale,
    hreflang: localeLabels[itemLocale].htmlLang,
    url: resolveUrl(baseUrl, localizePath(input.pathname, itemLocale)),
  }));
  return {
    pageTitle: input.pathname === '/' ? input.title : `${input.title} - ${messages.seo.titleSuffix}`,
    description: input.description,
    locale,
    htmlLang: localeLabels[locale].htmlLang,
    canonicalUrl,
    alternateUrls,
    xDefaultUrl: resolveUrl(baseUrl, canonicalPath(input.pathname, defaultLocale)),
    ogType: input.type === 'article' ? 'article' : 'website',
    ogUrl: canonicalUrl,
    ogImageUrl: resolveUrl(baseUrl, input.imagePath),
    robots: input.noindex ? 'noindex,follow' : 'index,follow',
    jsonLd:
      input.type === 'website'
        ? {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: messages.seo.websiteName,
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
                name: messages.seo.websiteName,
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
