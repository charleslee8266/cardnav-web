import fastify from 'fastify';
import fastifyFormbody from '@fastify/formbody';
import fastifyStatic from '@fastify/static';
import fastifyView from '@fastify/view';
import { Eta } from 'eta';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadDashboardData,
  loadPopularSearchTerms,
  recordProductClick,
  recordSearchTerm,
  submitSiteUrl,
} from './store.js';
import { buildSeoContext } from './seo.js';

const publicSiteUrl = process.env.SITE_URL || 'https://cardnav.xyz';
const telegramGroupUrl = 'https://t.me/cardnav_xyz_group';
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimePublicRoot = path.join(rootDir, 'public');
const runtimeViewRoot = path.join(rootDir, 'views');

export function createApp() {
  const app = fastify({ logger: false });
  const port = Number(process.env.PORT || 3000);

  app.register(fastifyStatic, {
    root: runtimePublicRoot,
  });
  app.register(fastifyFormbody);
  app.register(fastifyView, {
    engine: {
      eta: new Eta({
        useWith: true,
        views: runtimeViewRoot,
      }),
    },
    root: runtimeViewRoot,
    viewExt: 'eta',
    defaultContext: {
      telegramGroupUrl,
    },
  });

  app.get('/', async (_req, reply) => {
    const data = await loadDashboardData();
    const popularSearchTerms = (await loadPopularSearchTerms(10)).terms;
    const seo = buildSeoContext({
      baseUrl: publicSiteUrl,
      pathname: '/',
      title: '卡网大全 - AI 大模型账号购买导航',
      description: '不知道 ChatGPT Plus、Claude、Gemini、Grok 等 AI 账号在哪买？卡网大全聚合大模型账号商家，帮你查找购买入口、库存和价格。',
      imagePath: '/og-cardnav.svg',
      type: 'website',
    });
    return reply.view('index.eta', {
      ...seo,
      ...data,
      popularSearchTerms,
      initialSites: data.sites,
      initialProducts: data.products,
      searchQuery: '',
      siteQuery: '',
      productQuery: '',
      showSoldOut: false,
    });
  });

  app.get('/api/dashboard', async (_req, reply) => {
    return reply.header('cache-control', 'no-store').send(await loadDashboardData());
  });

  app.post('/api/search-terms', async (req, reply) => {
    const body = (req.body ?? {}) as { term?: unknown; resultCount?: unknown };
    const term = typeof body.term === 'string' ? body.term : '';
    const resultCount = typeof body.resultCount === 'number'
      ? body.resultCount
      : (typeof body.resultCount === 'string' ? Number(body.resultCount) : 0);
    if (!term.trim()) {
      return reply.status(400).header('cache-control', 'no-store').send({ ok: false });
    }
    const result = await recordSearchTerm(term, Number.isFinite(resultCount) ? resultCount : 0);
    return reply.status(result.recorded ? 202 : 204).header('cache-control', 'no-store').send(result.recorded ? { ok: true } : undefined);
  });

  app.post('/api/product-clicks', async (req, reply) => {
    const body = (req.body ?? {}) as {
      siteId?: unknown;
      productUrl?: unknown;
      categoryName?: unknown;
      name?: unknown;
    };
    const result = await recordProductClick({
      siteId: typeof body.siteId === 'string' ? body.siteId : '',
      productUrl: typeof body.productUrl === 'string' ? body.productUrl : undefined,
      categoryName: typeof body.categoryName === 'string' ? body.categoryName : undefined,
      name: typeof body.name === 'string' ? body.name : undefined,
    });
    return reply.status(result.recorded ? 202 : 204).header('cache-control', 'no-store').send(result.recorded ? { ok: true } : undefined);
  });

  app.get('/api/search-terms/popular', async (req, reply) => {
    const query = (req.query ?? {}) as { limit?: string };
    const limit = Number(query.limit || '10');
    const snapshot = await loadPopularSearchTerms(Number.isFinite(limit) ? limit : 10);
    return reply.header('cache-control', 'no-store').send({ terms: snapshot.terms });
  });

  app.get('/submit', (_req, reply) => {
    const seo = buildSeoContext({
      baseUrl: publicSiteUrl,
      pathname: '/submit',
      title: '商家入驻',
      description: '商家可提交站点 URL 入驻卡网大全，也可通过 Telegram 联系合作，获得更多曝光入口。',
      imagePath: '/og-cardnav.svg',
      type: 'webpage',
      noindex: true,
    });
    return reply.view('submit.eta', {
      ...seo,
      url: '',
      error: '',
      success: '',
    });
  });

  app.post('/submit', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const url = typeof body.url === 'string' ? body.url : '';
    const result = await submitSiteUrl(url);
    if (!result.ok) {
      return reply.status(400).header('cache-control', 'no-store').send({
        ok: false,
        message: result.message,
      });
    }
    return reply.header('cache-control', 'no-store').send({
      ok: true,
      message: '提交成功',
    });
  });

  app.setErrorHandler((err, _req, reply) => {
    console.error(err);
    reply.status(500).send('Internal Server Error');
  });

  return { app, port };
}
