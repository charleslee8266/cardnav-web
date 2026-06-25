/**
 * 文件说明: 验证 cardnav-web 公开 SEO 入口、可索引页面和 crawler 策略。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import {
  buildGatewayModelSeoRoutes,
  buildQuickPlanSearchSeoRoutes,
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemapIndexXml,
  buildSitemapTxt,
  buildSitemapXml,
  gatewayModelSitemapLimit,
  getPublicSeoRoutes,
  getPublicSeoRoutesForAllLocales,
  isIndexableGatewayModel,
  normalizePublicSeoRoutes,
  trainingCrawlerUserAgents,
} from '../src/seo-routes.js';
import { matchOfficialPriceCatalogEntries } from '../src/official-price.js';
import { buildSeoContext } from '../src/seo.js';
import { indexNowKey } from '../src/site.js';
import { localizePath, switchLocalePath } from '../src/i18n/paths.js';
import { quickPlanSearchPath, quickPlanSearchSeoPath, quickPlanSearchTerms } from '../src/shop-plan-search.js';

process.env.DATABASE_URL ??= 'postgres://postgres:cardnav@localhost:5432/cardnav';
process.env.PUBLIC_SITE_URL = 'https://cardnav.xyz';

const publicWebRoot = path.resolve('.');

test('cardnav-web sitemap, text sitemap and llms include every public SEO route', () => {
  const routes = getPublicSeoRoutesForAllLocales();
  const sitemapXml = buildSitemapXml('https://cardnav.xyz', routes);
  const sitemapTxt = buildSitemapTxt('https://cardnav.xyz', routes);
  const llmsTxt = buildLlmsTxt('https://cardnav.xyz', routes);

  assert.match(llmsTxt, /CardNav \/ 卡网大全/);
  assert.match(llmsTxt, /does not authorize model-training/);

  for (const route of routes) {
    const expectedUrl = new URL(route.pathname, 'https://cardnav.xyz/').toString();
    const expectedXmlUrl = expectedUrl.replace(/&/g, '&amp;');
    assert.match(sitemapXml, new RegExp(`<loc>${expectedXmlUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>`));
    assert.match(sitemapTxt, new RegExp(`^${expectedUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
    assert.match(llmsTxt, new RegExp(expectedUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  const locs = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.equal(new Set(locs).size, locs.length);
  assert.match(sitemapXml, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
  assert.match(sitemapXml, /<loc>https:\/\/cardnav\.xyz\/en<\/loc>/);
  assert.match(sitemapXml, /<loc>https:\/\/cardnav\.xyz\/ru\/privacy<\/loc>/);
  assert.match(sitemapXml, /<loc>https:\/\/cardnav\.xyz\/llm-gateway<\/loc>/);
  assert.match(sitemapXml, /<loc>https:\/\/cardnav\.xyz\/en\/llm-gateway<\/loc>/);
  assert.match(sitemapXml, /<loc>https:\/\/cardnav\.xyz\/shops<\/loc>/);
  assert.match(sitemapXml, /<loc>https:\/\/cardnav\.xyz\/en\/shops<\/loc>/);
  assert.doesNotMatch(sitemapXml, /relay/);
  assert.doesNotMatch(sitemapTxt, /relay/);
  assert.doesNotMatch(llmsTxt, /relay/);
  assert.match(sitemapXml, /<xhtml:link rel="alternate" hreflang="zh-CN" href="https:\/\/cardnav\.xyz\/" \/>/);
  assert.match(sitemapXml, /<xhtml:link rel="alternate" hreflang="en" href="https:\/\/cardnav\.xyz\/en" \/>/);
  assert.match(sitemapXml, /<xhtml:link rel="alternate" hreflang="ru" href="https:\/\/cardnav\.xyz\/ru" \/>/);
  assert.match(sitemapXml, /<xhtml:link rel="alternate" hreflang="x-default" href="https:\/\/cardnav\.xyz\/" \/>/);
  assert.match(llmsTxt, /https:\/\/cardnav\.xyz\/en\): AI gateway sites/);
  assert.match(llmsTxt, /https:\/\/cardnav\.xyz\/ru\): AI-шлюзы/);
});

test('cardnav-web sitemap index points crawlers to split sitemap files', () => {
  const sitemapIndex = buildSitemapIndexXml('https://cardnav.xyz', [
    { pathname: '/sitemap-static.xml' },
    { pathname: '/sitemap-guide.xml' },
    { pathname: '/sitemap-official-price.xml' },
    { pathname: '/sitemap-leaderboard.xml' },
    { pathname: '/sitemap-gateway-sites.xml' },
    { pathname: '/sitemap-gateway-models.xml' },
    { pathname: '/sitemap-shops.xml' },
  ]);

  assert.match(sitemapIndex, /<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(sitemapIndex, /<loc>https:\/\/cardnav\.xyz\/sitemap-static\.xml<\/loc>/);
  assert.match(sitemapIndex, /<loc>https:\/\/cardnav\.xyz\/sitemap-guide\.xml<\/loc>/);
  assert.match(sitemapIndex, /<loc>https:\/\/cardnav\.xyz\/sitemap-official-price\.xml<\/loc>/);
  assert.match(sitemapIndex, /<loc>https:\/\/cardnav\.xyz\/sitemap-leaderboard\.xml<\/loc>/);
  assert.match(sitemapIndex, /<loc>https:\/\/cardnav\.xyz\/sitemap-gateway-sites\.xml<\/loc>/);
  assert.match(sitemapIndex, /<loc>https:\/\/cardnav\.xyz\/sitemap-gateway-models\.xml<\/loc>/);
  assert.match(sitemapIndex, /<loc>https:\/\/cardnav\.xyz\/sitemap-shops\.xml<\/loc>/);
});

test('gateway model sitemap includes only higher-value model pages', () => {
  const routes = buildGatewayModelSeoRoutes([
    {
      id: 'gpt-5',
      modelId: 'gpt-5',
      modelFamily: 'OpenAI',
      supportSiteCount: 3,
      priceCount: 4,
      latestGatewayRefreshAt: '2026-06-24T10:00:00.000Z',
      latestGatewayRefreshTime: '',
    },
    {
      id: 'one-site-model',
      modelId: 'one-site-model',
      modelFamily: 'OpenAI',
      supportSiteCount: 1,
      priceCount: 4,
      latestGatewayRefreshAt: null,
      latestGatewayRefreshTime: '',
    },
    {
      id: 'other-family-model',
      modelId: 'other-family-model',
      modelFamily: 'Other',
      supportSiteCount: 4,
      priceCount: 4,
      latestGatewayRefreshAt: null,
      latestGatewayRefreshTime: '',
    },
  ]);

  const sitemapXml = buildSitemapXml('https://cardnav.xyz', routes);
  assert.equal(routes.length, 1);
  assert.match(sitemapXml, /\/llm-gateway\/models\/gpt-5/);
  assert.doesNotMatch(sitemapXml, /one-site-model/);
  assert.doesNotMatch(sitemapXml, /other-family-model/);
  assert.equal(isIndexableGatewayModel({ modelFamily: 'OpenAI', supportSiteCount: 2, priceCount: 2 }), true);
  assert.equal(isIndexableGatewayModel({ modelFamily: 'OpenAI', supportSiteCount: 1, priceCount: 2 }), false);
  assert.equal(gatewayModelSitemapLimit, 500);
});

test('cardnav-web sitemap includes hidden quick plan SEO slug pages', () => {
  const routes = getPublicSeoRoutesForAllLocales();
  const sitemapXml = buildSitemapXml('https://cardnav.xyz', routes);
  const sitemapTxt = buildSitemapTxt('https://cardnav.xyz', routes);
  const llmsTxt = buildLlmsTxt('https://cardnav.xyz', routes);
  const plusTerm = quickPlanSearchTerms.find(term => term.label === 'GPT Plus');
  assert.ok(plusTerm);

  const expectedPath = quickPlanSearchSeoPath(plusTerm);
  const searchPath = quickPlanSearchPath(plusTerm);
  const expectedUrl = new URL(expectedPath, 'https://cardnav.xyz/').toString();
  const expectedEnglishUrl = new URL(`/en${expectedPath}`, 'https://cardnav.xyz/').toString();
  const searchUrl = new URL(searchPath, 'https://cardnav.xyz/').toString();

  assert.match(sitemapXml, new RegExp(`<loc>${expectedUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>`));
  assert.match(sitemapXml, new RegExp(`hreflang="en" href="${expectedEnglishUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  assert.match(sitemapTxt, new RegExp(`^${expectedUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  assert.match(llmsTxt, new RegExp(expectedUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(sitemapTxt, new RegExp(`^${searchUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  assert.equal(buildQuickPlanSearchSeoRoutes().length, quickPlanSearchTerms.length);
});

test('cardnav-web sitemap ignores duplicate and invalid dynamic routes', () => {
  const routes = normalizePublicSeoRoutes([
    {
      pathname: '/official-price/chatgpt-plus',
      title: 'ChatGPT Plus',
      description: 'valid route',
      changefreq: 'daily',
    },
    {
      pathname: '/official-price/chatgpt-plus',
      title: 'ChatGPT Plus duplicate',
      description: 'duplicate route',
      changefreq: 'daily',
    },
    {
      pathname: 'official-price/no-leading-slash',
      title: 'Bad route',
      description: 'missing slash',
      changefreq: 'daily',
    },
    {
      pathname: '/official-price/../bad',
      title: 'Traversal route',
      description: 'invalid path',
      changefreq: 'daily',
    },
  ]);
  const sitemapXml = buildSitemapXml('https://cardnav.xyz', routes);
  const sitemapTxt = buildSitemapTxt('https://cardnav.xyz', routes);

  const locs = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.deepEqual(locs, ['https://cardnav.xyz/official-price/chatgpt-plus']);
  assert.match(sitemapXml, /<xhtml:link rel="alternate" hreflang="zh-CN" href="https:\/\/cardnav\.xyz\/official-price\/chatgpt-plus" \/>/);
  assert.match(sitemapXml, /<xhtml:link rel="alternate" hreflang="x-default" href="https:\/\/cardnav\.xyz\/official-price\/chatgpt-plus" \/>/);
  assert.doesNotMatch(sitemapXml, /hreflang="en" href="https:\/\/cardnav\.xyz\/en\/official-price\/chatgpt-plus"/);
  assert.doesNotMatch(sitemapXml, /hreflang="ru" href="https:\/\/cardnav\.xyz\/ru\/official-price\/chatgpt-plus"/);
  assert.equal(sitemapTxt, 'https://cardnav.xyz/official-price/chatgpt-plus\n');
});

test('cardnav-web robots allows indexing but blocks known model-training crawlers', () => {
  const robotsTxt = buildRobotsTxt('https://cardnav.xyz');

  assert.match(robotsTxt, /User-agent: \*/);
  assert.match(robotsTxt, /Allow: \//);
  assert.match(robotsTxt, /Sitemap: https:\/\/cardnav\.xyz\/sitemap\.xml/);
  assert.doesNotMatch(robotsTxt, /Sitemap: https:\/\/cardnav\.xyz\/sitemap-static\.xml/);
  assert.doesNotMatch(robotsTxt, /Sitemap: https:\/\/cardnav\.xyz\/sitemap-guide\.xml/);
  assert.doesNotMatch(robotsTxt, /Sitemap: https:\/\/cardnav\.xyz\/sitemap-official-price\.xml/);
  assert.doesNotMatch(robotsTxt, /Sitemap: https:\/\/cardnav\.xyz\/sitemap-leaderboard\.xml/);
  assert.doesNotMatch(robotsTxt, /Sitemap: https:\/\/cardnav\.xyz\/sitemap-gateway-sites\.xml/);
  assert.doesNotMatch(robotsTxt, /Sitemap: https:\/\/cardnav\.xyz\/sitemap-gateway-models\.xml/);
  assert.doesNotMatch(robotsTxt, /Sitemap: https:\/\/cardnav\.xyz\/sitemap\.txt/);

  for (const userAgent of trainingCrawlerUserAgents) {
    assert.match(robotsTxt, new RegExp(`User-agent: ${userAgent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\nDisallow: /`));
  }
});

test('cardnav-web serves its own Open Graph image assets', async () => {
  const pngMetadata = await sharp(path.join(publicWebRoot, 'public/og-cardnav.png')).metadata();
  const webpMetadata = await sharp(path.join(publicWebRoot, 'public/og-cardnav.webp')).metadata();

  assert.equal(pngMetadata.format, 'png');
  assert.equal(pngMetadata.width, 1200);
  assert.equal(pngMetadata.height, 630);
  assert.equal(webpMetadata.format, 'webp');
  assert.equal(webpMetadata.width, 1200);
  assert.equal(webpMetadata.height, 630);
});

test('seo context prefers webp Open Graph image for default asset', () => {
  const seo = buildSeoContext({
    baseUrl: 'https://cardnav.xyz',
    pathname: '/shops',
    title: '卡网商品',
    description: '商品页。',
    imagePath: '/og-cardnav.png',
    type: 'webpage',
  });

  assert.match(seo.ogImageUrl, /\/og-cardnav\.webp$/);
});

test('seo context includes Organization structured data', () => {
  const seo = buildSeoContext({
    baseUrl: 'https://cardnav.xyz',
    pathname: '/',
    title: '卡网大全',
    description: '首页。',
    imagePath: '/og-cardnav.png',
    type: 'website',
  });

  const graph = (seo.jsonLd as { '@graph': Array<Record<string, unknown>> })['@graph'];
  const organizationNode = graph.find(node => node['@type'] === 'Organization');
  assert.ok(organizationNode);
  assert.equal(organizationNode.name, '卡网大全');
  assert.match(String(organizationNode.logo), /\/favicon\.webp$/);
});

test('IndexNow key file is available for search engine submission', () => {
  const keyFile = path.join(publicWebRoot, 'public', `${indexNowKey}.txt`);
  const content = fs.readFileSync(keyFile, 'utf8').trim();
  assert.equal(content, indexNowKey);
});

test('homepage official price matcher keeps preferred plan order', () => {
  const catalog = [
    {
      appSlug: 'claude',
      planSlug: 'pro',
      urlSlug: 'claude-pro',
      appName: 'Claude',
      planName: 'Pro',
      displayName: 'Claude Pro',
      isDefault: false,
      displayOrder: 20,
    },
    {
      appSlug: 'chatgpt',
      planSlug: 'plus',
      urlSlug: 'chatgpt-plus',
      appName: 'ChatGPT',
      planName: 'Plus',
      displayName: 'ChatGPT Plus',
      isDefault: true,
      displayOrder: 10,
    },
  ];
  const matched = matchOfficialPriceCatalogEntries(catalog, [
    { app: 'chatgpt', plan: 'plus' },
    { app: 'claude', plan: 'pro' },
  ]);
  assert.deepEqual(matched.map(entry => entry.urlSlug), ['chatgpt-plus', 'claude-pro']);
});

test('shops product schema emits Product nodes with Offer data', () => {
  const seo = buildSeoContext({
    baseUrl: 'https://cardnav.xyz',
    pathname: '/shops',
    title: '卡网商品',
    description: '商品页。',
    imagePath: '/og-cardnav.png',
    type: 'webpage',
    products: [{
      name: 'GPT Plus',
      url: 'https://example.com/product',
      price: 18,
      priceCurrency: 'CNY',
      availability: 'InStock',
    }],
  });

  const graph = (seo.jsonLd as { '@graph': Array<Record<string, unknown>> })['@graph'];
  const productNode = graph.find(node => node['@type'] === 'Product');
  assert.ok(productNode);
  assert.equal((productNode.offers as { '@type': string })['@type'], 'Offer');
  assert.equal((productNode.offers as { price: string }).price, '18');
});

test('non-database public SEO routes build canonical metadata', () => {
  for (const route of getPublicSeoRoutes()) {
    const seo = buildSeoContext({
      baseUrl: 'https://cardnav.xyz',
      pathname: route.pathname,
      title: route.title,
      description: route.description,
      imagePath: '/og-cardnav.png',
      type: route.pathname === '/' ? 'website' : 'webpage',
    });
    assert.equal(seo.canonicalUrl, new URL(route.pathname, 'https://cardnav.xyz/').toString(), route.pathname);
    assert.equal(seo.robots, 'index,follow', route.pathname);
    assert.equal(seo.description, route.description, route.pathname);
    assert.match(seo.ogImageUrl, /\/og-cardnav\.webp$/, route.pathname);
  }

  const englishSeo = buildSeoContext({
    baseUrl: 'https://cardnav.xyz',
    pathname: '/about',
    title: 'About CardNav',
    description: 'About CardNav.',
    imagePath: '/og-cardnav.png',
    type: 'webpage',
    locale: 'en',
  });
  assert.equal(englishSeo.canonicalUrl, 'https://cardnav.xyz/en/about');
  assert.equal(englishSeo.description, 'About CardNav.');
});

test('noindex pages keep links followable', () => {
  const seo = buildSeoContext({
    baseUrl: 'https://cardnav.xyz',
    pathname: '/llm-gateway/models/low-value-model',
    title: 'low-value-model gateway support',
    description: 'Gateway support.',
    imagePath: '/og-cardnav.png',
    type: 'webpage',
    noindex: true,
  });

  assert.equal(seo.robots, 'noindex,follow');
});

test('homepage website schema includes SearchAction', () => {
  const seo = buildSeoContext({
    baseUrl: 'https://cardnav.xyz',
    pathname: '/',
    title: '卡网大全',
    description: '导航站点。',
    imagePath: '/og-cardnav.png',
    type: 'website',
    enableSiteSearch: true,
  });

  const graph = (seo.jsonLd as { '@graph': Array<Record<string, unknown>> })['@graph'];
  const websiteNode = graph.find(node => node['@type'] === 'WebSite');
  assert.ok(websiteNode);
  assert.equal((websiteNode.potentialAction as { '@type': string })['@type'], 'SearchAction');
  assert.match(String((websiteNode.potentialAction as { target: { urlTemplate: string } }).target.urlTemplate), /\/shops\?q=\{search_term_string\}$/);
});

test('detail pages can include breadcrumb structured data', () => {
  const seo = buildSeoContext({
    baseUrl: 'https://cardnav.xyz',
    pathname: '/shops/gpt-plus',
    title: 'GPT Plus 相关商品搜索结果',
    description: '相关搜索结果。',
    imagePath: '/og-cardnav.png',
    type: 'webpage',
    breadcrumbs: [
      { name: '卡网商品', pathname: '/shops' },
      { name: 'GPT Plus', pathname: '/shops/gpt-plus' },
    ],
  });

  const graph = (seo.jsonLd as { '@graph': Array<Record<string, unknown>> })['@graph'];
  const breadcrumbNode = graph.find(node => node['@type'] === 'BreadcrumbList');
  assert.ok(breadcrumbNode);
  assert.equal((breadcrumbNode.itemListElement as Array<{ position: number }>)[1].position, 2);
});

test('shops query pages should use noindex while keeping canonical /shops', () => {
  const seo = buildSeoContext({
    baseUrl: 'https://cardnav.xyz',
    pathname: '/shops',
    title: '卡网商品',
    description: '商品搜索结果。',
    imagePath: '/og-cardnav.png',
    type: 'website',
    noindex: true,
  });

  assert.equal(seo.robots, 'noindex,follow');
  assert.equal(seo.canonicalUrl, 'https://cardnav.xyz/shops');
  assert.equal(seo.ogLocale, 'zh_CN');
  assert.equal(seo.ogImageWidth, 1200);
  assert.equal(seo.ogImageHeight, 630);
  assert.equal(seo.ogSiteName, '卡网大全');
});

test('quick plan search SEO metadata uses slug canonical and alternates', () => {
  const plusTerm = quickPlanSearchTerms.find(term => term.label === 'GPT Plus');
  assert.ok(plusTerm);
  const pathname = quickPlanSearchSeoPath(plusTerm);
  const seo = buildSeoContext({
    baseUrl: 'https://cardnav.xyz',
    pathname,
    title: 'GPT Plus 相关商品搜索结果',
    description: '相关搜索结果。',
    imagePath: '/og-cardnav.png',
    type: 'website',
  });

  assert.equal(seo.canonicalUrl, new URL(pathname, 'https://cardnav.xyz/').toString());
  assert.equal(seo.xDefaultUrl, seo.canonicalUrl);
  assert.deepEqual(
    seo.alternateUrls.map(item => item.url),
    [
      new URL(pathname, 'https://cardnav.xyz/').toString(),
      new URL(`/en${pathname}`, 'https://cardnav.xyz/').toString(),
      new URL(`/ru${pathname}`, 'https://cardnav.xyz/').toString(),
    ],
  );
});

test('localized routes preserve dotted model ids without treating them as assets', () => {
  const modelPath = '/llm-gateway/models/gpt-5.5';

  assert.equal(localizePath(modelPath, 'en'), '/en/llm-gateway/models/gpt-5.5');
  assert.equal(switchLocalePath('/zh/llm-gateway/models/gpt-5.5', 'ru'), '/ru/llm-gateway/models/gpt-5.5');
  assert.equal(localizePath('/favicon.png', 'en'), '/favicon.png');
  assert.equal(localizePath('/assets/payment-icons/alipay.svg', 'en'), '/assets/payment-icons/alipay.svg');

  const seo = buildSeoContext({
    baseUrl: 'https://cardnav.xyz',
    pathname: modelPath,
    title: 'gpt-5.5 gateway support',
    description: 'Gateway support.',
    imagePath: '/og-cardnav.png',
    type: 'webpage',
    locale: 'en',
  });

  assert.equal(seo.canonicalUrl, 'https://cardnav.xyz/en/llm-gateway/models/gpt-5.5');
  assert.deepEqual(
    seo.alternateUrls.map(item => item.url),
    [
      'https://cardnav.xyz/llm-gateway/models/gpt-5.5',
      'https://cardnav.xyz/en/llm-gateway/models/gpt-5.5',
      'https://cardnav.xyz/ru/llm-gateway/models/gpt-5.5',
    ],
  );
});
