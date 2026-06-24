/**
 * 文件说明: 验证 cardnav-web 公开 SEO 入口、可索引页面和 crawler 策略。
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import {
  buildQuickPlanSearchSeoRoutes,
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemapTxt,
  buildSitemapXml,
  getPublicSeoRoutes,
  getPublicSeoRoutesForAllLocales,
  normalizePublicSeoRoutes,
  trainingCrawlerUserAgents,
} from '../src/seo-routes.js';
import { buildSeoContext } from '../src/seo.js';
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
  assert.doesNotMatch(sitemapXml, /llm-relay/);
  assert.doesNotMatch(sitemapTxt, /llm-relay/);
  assert.doesNotMatch(llmsTxt, /llm-relay/);
  assert.match(sitemapXml, /<xhtml:link rel="alternate" hreflang="zh-CN" href="https:\/\/cardnav\.xyz\/" \/>/);
  assert.match(sitemapXml, /<xhtml:link rel="alternate" hreflang="en" href="https:\/\/cardnav\.xyz\/en" \/>/);
  assert.match(sitemapXml, /<xhtml:link rel="alternate" hreflang="ru" href="https:\/\/cardnav\.xyz\/ru" \/>/);
  assert.match(sitemapXml, /<xhtml:link rel="alternate" hreflang="x-default" href="https:\/\/cardnav\.xyz\/" \/>/);
  assert.match(llmsTxt, /https:\/\/cardnav\.xyz\/en\): AI gateway sites/);
  assert.match(llmsTxt, /https:\/\/cardnav\.xyz\/ru\): AI-шлюзы/);
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
  assert.match(robotsTxt, /Sitemap: https:\/\/cardnav\.xyz\/sitemap\.txt/);

  for (const userAgent of trainingCrawlerUserAgents) {
    assert.match(robotsTxt, new RegExp(`User-agent: ${userAgent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\nDisallow: /`));
  }
});

test('cardnav-web serves its own Open Graph image asset', async () => {
  const metadata = await sharp(path.join(publicWebRoot, 'public/og-cardnav.png')).metadata();

  assert.equal(metadata.format, 'png');
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 630);
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
    assert.match(seo.ogImageUrl, /\/og-cardnav\.png$/, route.pathname);
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
