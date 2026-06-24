/**
 * 文件说明: 维护公开站点可索引页面清单，并生成 sitemap、robots 和 llms.txt 内容。
 */
import type { GuideArticle } from './guide.js';
import { defaultLocale, localeLabels, supportedLocales, type Locale } from './i18n/config.js';
import { getMessages } from './i18n/messages.js';
import { getLocalePathInfo, localizePath } from './i18n/paths.js';
import { localizeTaskLabel } from './localized-display.js';
import type { ModelLeaderboardGroup } from './model-leaderboard.js';
import type { OfficialPriceGroup } from './official-price.js';
import { loadPageContent } from './page-content.js';
import { quickPlanSearchSeoPath, quickPlanSearchTerms } from './shop-plan-search.js';
import type { PublicRelayModelRow, PublicRelaySiteRow } from './store.js';

export type PublicSeoRoute = {
  pathname: string;
  title: string;
  description: string;
  changefreq: 'daily' | 'weekly' | 'monthly';
  lastmod?: string;
};

function routePath(pathname: string, locale: Locale) {
  return localizePath(pathname, locale);
}

export function getStaticPublicSeoRoutes(locale: Locale = defaultLocale): PublicSeoRoute[] {
  const messages = getMessages(locale);
  const aboutContent = loadPageContent('about', locale);
  const disclaimerContent = loadPageContent('disclaimer', locale);
  const privacyContent = loadPageContent('privacy', locale);
  return [
    {
      pathname: routePath('/', locale),
      title: messages.site.name,
      description: messages.home.seoDescription,
      changefreq: 'daily',
    },
    {
      pathname: routePath('/llm-gateway', locale),
      title: messages.llmRelay.seoTitle,
      description: messages.llmRelay.seoDescription,
      changefreq: 'daily',
    },
    {
      pathname: routePath('/model-leaderboard', locale),
      title: messages.leaderboard.seoTitle,
      description: messages.leaderboard.seoDescription,
      changefreq: 'daily',
    },
    {
      pathname: routePath('/official-price', locale),
      title: messages.officialPrice.seoTitle,
      description: messages.officialPrice.seoDescription,
      changefreq: 'daily',
    },
    {
      pathname: routePath('/tools', locale),
      title: messages.tools.title,
      description: messages.tools.seoDescription,
      changefreq: 'weekly',
    },
    {
      pathname: routePath('/tools/session-converter', locale),
      title: messages.tools.sessionConverter.title,
      description: messages.sessionConverter.seoDescription,
      changefreq: 'monthly',
    },
    {
      pathname: routePath('/tools/ip-purity', locale),
      title: messages.ipPurity.title,
      description: messages.ipPurity.seoDescription,
      changefreq: 'weekly',
    },
    {
      pathname: routePath('/guide', locale),
      title: messages.nav.guide,
      description: messages.guide.seoDescription,
      changefreq: 'weekly',
    },
    {
      pathname: routePath('/about', locale),
      title: aboutContent.title,
      description: aboutContent.description,
      changefreq: 'monthly',
    },
    {
      pathname: routePath('/disclaimer', locale),
      title: disclaimerContent.title,
      description: disclaimerContent.description,
      changefreq: 'monthly',
    },
    {
      pathname: routePath('/privacy', locale),
      title: privacyContent.title,
      description: privacyContent.description,
      changefreq: 'monthly',
    },
  ];
}

export const staticPublicSeoRoutes: PublicSeoRoute[] = getStaticPublicSeoRoutes(defaultLocale);

export const trainingCrawlerUserAgents = [
  'GPTBot',
  'CCBot',
  'ClaudeBot',
  'anthropic-ai',
  'Google-Extended',
  'Applebot-Extended',
  'Bytespider',
  'Amazonbot',
  'Meta-ExternalAgent',
  'FacebookBot',
];

export function normalizeBaseUrl(baseUrlInput: string) {
  return baseUrlInput.trim().replace(/\/+$/, '');
}

export function resolvePublicUrl(baseUrlInput: string, pathname: string) {
  return new URL(pathname, `${normalizeBaseUrl(baseUrlInput)}/`).toString();
}

export async function loadGuideArticles(locale: Locale = defaultLocale) {
  const guideModule = await import('./guide.js');
  return guideModule.getGuideCollection(locale).guideArticles;
}

export function getPublicSeoRoutes(guideRoutes: GuideArticle[] = [], locale: Locale = defaultLocale): PublicSeoRoute[] {
  return [
    ...getStaticPublicSeoRoutes(locale),
    ...guideRoutes.map(article => ({
      pathname: routePath(`/guide/${article.slug}`, locale),
      title: article.title,
      description: article.description,
      changefreq: 'monthly' as const,
    })),
  ];
}

export function buildOfficialPriceSeoRoutes(groups: OfficialPriceGroup[], locale: Locale = defaultLocale): PublicSeoRoute[] {
  const messages = getMessages(locale);
  return groups.map(group => ({
    pathname: routePath(group.pathname, locale),
    title: `${group.displayName} ${messages.officialPrice.titleSuffix}`,
    description: messages.officialPrice.dynamicDescription.replace('{displayName}', group.displayName),
    changefreq: 'daily' as const,
  }));
}

export function buildModelLeaderboardSeoRoutes(groups: ModelLeaderboardGroup[], locale: Locale = defaultLocale): PublicSeoRoute[] {
  const messages = getMessages(locale);
  return groups.map(group => {
    const displayName = localizeTaskLabel(group.taskSlug, messages);
    return {
      pathname: routePath(group.pathname, locale),
      title: `${displayName}${messages.leaderboard.titleSuffix}`,
      description: messages.leaderboard.dynamicDescription.replace('{taskLabel}', displayName),
      changefreq: 'daily' as const,
    };
  });
}

export function buildQuickPlanSearchSeoRoutes(locale: Locale = defaultLocale): PublicSeoRoute[] {
  const messages = getMessages(locale);
  return quickPlanSearchTerms.map(term => ({
    pathname: routePath(quickPlanSearchSeoPath(term), locale),
    title: messages.shops.searchResultsTitle.replace('{term}', term.label),
    description: messages.shops.searchResultsDescription.replace('{term}', term.label),
    changefreq: 'weekly' as const,
  }));
}

export function buildRelaySeoRoutes(relaySites: PublicRelaySiteRow[], locale: Locale = defaultLocale): PublicSeoRoute[] {
  const messages = getMessages(locale);
  return relaySites
    .filter(site => site.slug)
    .map(site => ({
      pathname: routePath(`/llm-gateway/${site.slug}`, locale),
      title: messages.llmRelay.detailSeoTitle.replace('{name}', site.name),
      description: messages.llmRelay.detailSeoDescription
        .replace('{name}', site.name)
        .replace('{modelCount}', String(site.modelCount))
        .replace('{priceCount}', String(site.priceCount)),
      changefreq: 'daily' as const,
      lastmod: site.latestRelayRefreshAt ?? undefined,
    }));
}

export function buildRelayModelSeoRoutes(relayModels: PublicRelayModelRow[], locale: Locale = defaultLocale): PublicSeoRoute[] {
  const messages = getMessages(locale);
  return relayModels.map(model => ({
    pathname: routePath(`/llm-gateway/models/${encodeURIComponent(model.modelId)}`, locale),
    title: messages.llmRelay.modelDetailSeoTitle.replace('{model}', model.modelId),
    description: messages.llmRelay.modelDetailSeoDescription.replace('{model}', model.modelId),
    changefreq: 'daily' as const,
    lastmod: model.latestRelayRefreshAt ?? undefined,
  }));
}

export function getPublicSeoRoutesWithDynamicPages(params: {
  officialPriceGroups?: OfficialPriceGroup[];
  modelLeaderboardGroups?: ModelLeaderboardGroup[];
  relaySites?: PublicRelaySiteRow[];
  relayModels?: PublicRelayModelRow[];
  guideRoutes?: GuideArticle[];
  locale?: Locale;
} = {}): PublicSeoRoute[] {
  const locale = params.locale ?? defaultLocale;
  return normalizePublicSeoRoutes([
    ...getPublicSeoRoutes(params.guideRoutes, locale),
    ...buildOfficialPriceSeoRoutes(params.officialPriceGroups ?? [], locale),
    ...buildModelLeaderboardSeoRoutes(params.modelLeaderboardGroups ?? [], locale),
    ...buildRelaySeoRoutes(params.relaySites ?? [], locale),
    ...buildRelayModelSeoRoutes(params.relayModels ?? [], locale),
    ...buildQuickPlanSearchSeoRoutes(locale),
  ]);
}

export function getPublicSeoRoutesForAllLocales(params: {
  officialPriceGroups?: OfficialPriceGroup[];
  modelLeaderboardGroups?: ModelLeaderboardGroup[];
  relaySites?: PublicRelaySiteRow[];
  relayModels?: PublicRelayModelRow[];
  guideRoutesByLocale?: Map<Locale, GuideArticle[]>;
} = {}) {
  return normalizePublicSeoRoutes(supportedLocales.flatMap(locale => getPublicSeoRoutesWithDynamicPages({
    officialPriceGroups: params.officialPriceGroups,
    modelLeaderboardGroups: params.modelLeaderboardGroups,
    relaySites: params.relaySites,
    relayModels: params.relayModels,
    guideRoutes: params.guideRoutesByLocale?.get(locale) ?? [],
    locale,
  })));
}

export function normalizePublicSeoRoutes(routes: PublicSeoRoute[]) {
  const seenPathnames = new Set<string>();
  const normalizedRoutes: PublicSeoRoute[] = [];

  for (const route of routes) {
    const pathname = route.pathname.trim();
    if (!pathname.startsWith('/')) continue;
    if (pathname.includes('..')) continue;
    if (seenPathnames.has(pathname)) continue;
    seenPathnames.add(pathname);
    normalizedRoutes.push({ ...route, pathname });
  }

  return normalizedRoutes;
}

function escapeXml(input: string) {
  return input.replace(/[&<>"']/g, character => {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    }[character] ?? character;
  });
}

function buildSitemapAlternateLinks(baseUrlInput: string, route: PublicSeoRoute, routesByRoutePathname: Map<string, PublicSeoRoute[]>) {
  const routePathname = getLocalePathInfo(route.pathname).routePathname;
  const routeGroup = routesByRoutePathname.get(routePathname) ?? [];
  const pathnameByLocale = new Map(routeGroup.map(item => {
    const localePathInfo = getLocalePathInfo(item.pathname);
    return [localePathInfo.locale, item.pathname] as const;
  }));
  const alternateLinks = supportedLocales
    .flatMap(locale => {
      const pathname = pathnameByLocale.get(locale);
      if (!pathname) return [];
      return [
        `    <xhtml:link rel="alternate" hreflang="${escapeXml(localeLabels[locale].htmlLang)}" href="${escapeXml(resolvePublicUrl(baseUrlInput, pathname))}" />`,
      ];
    });
  const defaultPathname = pathnameByLocale.get(defaultLocale);
  if (defaultPathname) {
    alternateLinks.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(resolvePublicUrl(baseUrlInput, defaultPathname))}" />`);
  }
  return alternateLinks;
}

export function buildSitemapXml(baseUrlInput: string, routes = getPublicSeoRoutes()) {
  const normalizedRoutes = normalizePublicSeoRoutes(routes);
  const routesByRoutePathname = new Map<string, PublicSeoRoute[]>();
  for (const route of normalizedRoutes) {
    const routePathname = getLocalePathInfo(route.pathname).routePathname;
    routesByRoutePathname.set(routePathname, [...(routesByRoutePathname.get(routePathname) ?? []), route]);
  }

  const items = normalizedRoutes
    .map(route => {
      const lines = [
        '  <url>',
        `    <loc>${escapeXml(resolvePublicUrl(baseUrlInput, route.pathname))}</loc>`,
        ...buildSitemapAlternateLinks(baseUrlInput, route, routesByRoutePathname),
      ];
      if (route.lastmod) {
        lines.push(`    <lastmod>${escapeXml(route.lastmod)}</lastmod>`);
      }
      lines.push(`    <changefreq>${route.changefreq}</changefreq>`, '  </url>');
      return lines.join('\n');
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${items}\n</urlset>\n`;
}

export function buildSitemapTxt(baseUrlInput: string, routes = getPublicSeoRoutes()) {
  return `${normalizePublicSeoRoutes(routes)
    .map(route => resolvePublicUrl(baseUrlInput, route.pathname))
    .join('\n')}\n`;
}

export function buildRobotsTxt(baseUrlInput: string) {
  const baseUrl = normalizeBaseUrl(baseUrlInput);
  return [
    '# Search and answer crawlers may index public pages.',
    '# Model-training crawlers listed below are not authorized.',
    'User-agent: *',
    'Allow: /',
    '',
    ...trainingCrawlerUserAgents.flatMap(userAgent => [
      `User-agent: ${userAgent}`,
      'Disallow: /',
      '',
    ]),
    `Sitemap: ${baseUrl}/sitemap.xml`,
    `Sitemap: ${baseUrl}/sitemap.txt`,
    '',
  ].join('\n');
}

export function buildLlmsTxt(baseUrlInput: string, routes = getPublicSeoRoutes()) {
  const baseUrl = normalizeBaseUrl(baseUrlInput);
  const messages = getMessages(defaultLocale);
  const routeLines = normalizePublicSeoRoutes(routes)
    .map(route => `- [${route.title}](${resolvePublicUrl(baseUrl, route.pathname)}): ${route.description}`)
    .join('\n');
  return [
    `# CardNav / ${messages.site.name}`,
    '',
    messages.seo.llmsDescription,
    '',
    '## Important URLs',
    '',
    routeLines,
    '',
    '## Sitemaps',
    '',
    `- ${baseUrl}/sitemap.xml`,
    `- ${baseUrl}/sitemap.txt`,
    '',
    '## Crawler Policy',
    '',
    messages.seo.crawlerPolicy,
    '',
  ].join('\n');
}
