/**
 * 文件说明: 生成公开页面的 canonical、Open Graph 和结构化数据上下文。
 */
import { defaultLocale, localeLabels, supportedLocales, type Locale } from './i18n/config.js';
import { canonicalPath, localizePath } from './i18n/paths.js';
import { getMessages } from './i18n/messages.js';

const ogLocaleByLocale: Record<Locale, string> = {
  zh: 'zh_CN',
  en: 'en_US',
  ru: 'ru_RU',
};

export const defaultOgImageWidth = 1200;
export const defaultOgImageHeight = 630;

export type SeoBreadcrumb = {
  name: string;
  pathname: string;
};

export type SeoListItem = {
  name: string;
  url?: string;
  position?: number;
};

export type SeoProductItem = {
  name: string;
  url?: string;
  price?: number;
  priceCurrency?: string;
  availability?: 'InStock' | 'OutOfStock';
};

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
  breadcrumbs?: SeoBreadcrumb[];
  listItems?: SeoListItem[];
  products?: SeoProductItem[];
  enableSiteSearch?: boolean;
}

function resolveOgImagePath(imagePath: string) {
  return imagePath === '/og-cardnav.png' ? '/og-cardnav.webp' : imagePath;
}

export function normalizeSiteUrl(input: string) {
  return input.trim().replace(/\/+$/, '');
}

function resolveUrl(baseUrl: string, pathname: string) {
  return new URL(pathname, `${normalizeSiteUrl(baseUrl)}/`).toString();
}

function buildJsonLdGraph(nodes: Record<string, unknown>[]) {
  const filtered = nodes.filter(node => Object.keys(node).length > 0);
  if (filtered.length === 0) return {};
  if (filtered.length === 1) return filtered[0];
  return {
    '@context': 'https://schema.org',
    '@graph': filtered,
  };
}

function buildBreadcrumbJsonLd(
  baseUrl: string,
  breadcrumbs: SeoBreadcrumb[],
  locale: Locale,
) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: resolveUrl(baseUrl, localizePath(crumb.pathname, locale)),
    })),
  };
}

function buildItemListJsonLd(listItems: SeoListItem[]) {
  return {
    '@type': 'ItemList',
    itemListElement: listItems.map((item, index) => ({
      '@type': 'ListItem',
      position: item.position ?? index + 1,
      name: item.name,
      ...(item.url ? { url: item.url } : {}),
    })),
  };
}

function buildProductJsonLd(products: SeoProductItem[], pageUrl: string) {
  return products.map(product => ({
    '@type': 'Product',
    name: product.name,
    ...(product.url ? { url: product.url } : {}),
    offers: {
      '@type': 'Offer',
      url: product.url || pageUrl,
      ...(typeof product.price === 'number' && Number.isFinite(product.price)
        ? {
            price: String(product.price),
            priceCurrency: product.priceCurrency || 'CNY',
          }
        : {}),
      availability: `https://schema.org/${product.availability || 'InStock'}`,
    },
  }));
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
  const pageTitle = input.pathname === '/' ? input.title : `${input.title} - ${messages.seo.titleSuffix}`;
  const ogImageUrl = resolveUrl(baseUrl, resolveOgImagePath(input.imagePath));
  const jsonLdNodes: Record<string, unknown>[] = [
    {
      '@type': 'Organization',
      name: messages.seo.websiteName,
      url: baseUrl,
      logo: resolveUrl(baseUrl, '/favicon.webp'),
    },
  ];

  if (input.type === 'website') {
    const websiteNode: Record<string, unknown> = {
      '@type': 'WebSite',
      name: messages.seo.websiteName,
      url: canonicalUrl,
      description: input.description,
    };
    if (input.enableSiteSearch || input.pathname === '/') {
      const shopsPath = localizePath('/shops', locale);
      websiteNode.potentialAction = {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${resolveUrl(baseUrl, shopsPath)}?q={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      };
    }
    jsonLdNodes.push(websiteNode);
  } else if (input.type === 'article') {
    jsonLdNodes.push({
      '@type': 'Article',
      headline: input.title,
      name: input.title,
      url: canonicalUrl,
      description: input.description,
      image: ogImageUrl,
      inLanguage: localeLabels[locale].htmlLang,
      datePublished: input.datePublished,
      dateModified: input.dateModified ?? input.datePublished,
      publisher: {
        '@type': 'Organization',
        name: messages.seo.websiteName,
        url: baseUrl,
      },
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': canonicalUrl,
      },
    });
  } else {
    jsonLdNodes.push({
      '@type': 'WebPage',
      name: input.title,
      url: canonicalUrl,
      description: input.description,
    });
  }

  if (input.breadcrumbs?.length) {
    jsonLdNodes.push(buildBreadcrumbJsonLd(baseUrl, input.breadcrumbs, locale));
  }

  if (input.listItems?.length) {
    jsonLdNodes.push(buildItemListJsonLd(input.listItems));
  }

  if (input.products?.length) {
    jsonLdNodes.push(...buildProductJsonLd(input.products, canonicalUrl));
  }

  return {
    pageTitle,
    description: input.description,
    locale,
    htmlLang: localeLabels[locale].htmlLang,
    canonicalUrl,
    alternateUrls,
    xDefaultUrl: resolveUrl(baseUrl, canonicalPath(input.pathname, defaultLocale)),
    ogType: input.type === 'article' ? 'article' : 'website',
    ogUrl: canonicalUrl,
    ogImageUrl,
    ogImageAlt: pageTitle,
    ogImageWidth: defaultOgImageWidth,
    ogImageHeight: defaultOgImageHeight,
    ogSiteName: messages.seo.websiteName,
    ogLocale: ogLocaleByLocale[locale],
    ogLocaleAlternates: supportedLocales
      .filter(itemLocale => itemLocale !== locale)
      .map(itemLocale => ogLocaleByLocale[itemLocale]),
    robots: input.noindex ? 'noindex,follow' : 'index,follow',
    jsonLd: buildJsonLdGraph(jsonLdNodes),
  };
}