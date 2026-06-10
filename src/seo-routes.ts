/**
 * 文件说明: 维护公开站点可索引页面清单，并生成 sitemap、robots 和 llms.txt 内容。
 */
import { knowledgeArticles } from './knowledge.js';

export type PublicSeoRoute = {
  pathname: string;
  title: string;
  description: string;
  changefreq: 'daily' | 'weekly' | 'monthly';
  lastmod?: string;
};

export const staticPublicSeoRoutes: PublicSeoRoute[] = [
  {
    pathname: '/',
    title: '卡网大全',
    description: 'AI 大模型账号购买导航，聚合 ChatGPT Plus、Claude、Gemini、Grok 等账号商家、库存、价格和购买入口。',
    changefreq: 'daily',
  },
  {
    pathname: '/submit',
    title: '提交商家',
    description: '商家提交站点 URL 入驻卡网大全，进入后续收录和展示流程。',
    changefreq: 'monthly',
  },
  {
    pathname: '/tools',
    title: '工具集',
    description: '与 AI 账号、订阅和导入格式相关的小工具集合。',
    changefreq: 'weekly',
  },
  {
    pathname: '/tools/session-converter',
    title: 'Session 转换工具',
    description: '在浏览器本地转换 ChatGPT Web session、Codex auth.json 和 9Router OAuth JSON 等账号凭证格式。',
    changefreq: 'monthly',
  },
  {
    pathname: '/knowledge',
    title: '知识库',
    description: 'AI 账号购买、商家选择和虚拟商品下单前的判断方法。',
    changefreq: 'weekly',
  },
  {
    pathname: '/disclaimer',
    title: '免责声明',
    description: '第三方商家信息、价格库存、购买入口、合作展示和交易责任边界说明。',
    changefreq: 'monthly',
  },
  {
    pathname: '/privacy',
    title: '隐私政策',
    description: '访问统计、提交信息、第三方链接、联系方式和数据使用方式说明。',
    changefreq: 'monthly',
  },
];

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

export function getPublicSeoRoutes(): PublicSeoRoute[] {
  return [
    ...staticPublicSeoRoutes,
    ...knowledgeArticles.map(article => ({
      pathname: `/knowledge/${article.slug}`,
      title: article.title,
      description: article.description,
      changefreq: 'monthly' as const,
      lastmod: article.dateModified,
    })),
  ];
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

export function buildSitemapXml(baseUrlInput: string) {
  const items = getPublicSeoRoutes()
    .map(route => {
      const lines = [
        '  <url>',
        `    <loc>${escapeXml(resolvePublicUrl(baseUrlInput, route.pathname))}</loc>`,
      ];
      if (route.lastmod) {
        lines.push(`    <lastmod>${escapeXml(route.lastmod)}</lastmod>`);
      }
      lines.push(`    <changefreq>${route.changefreq}</changefreq>`, '  </url>');
      return lines.join('\n');
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>\n`;
}

export function buildSitemapTxt(baseUrlInput: string) {
  return `${getPublicSeoRoutes()
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

export function buildLlmsTxt(baseUrlInput: string) {
  const baseUrl = normalizeBaseUrl(baseUrlInput);
  const routeLines = getPublicSeoRoutes()
    .map(route => `- [${route.title}](${resolvePublicUrl(baseUrl, route.pathname)}): ${route.description}`)
    .join('\n');
  return [
    '# CardNav / 卡网大全',
    '',
    'CardNav is a Chinese public directory for AI account merchants, products, stock status, prices, submission, and buyer education.',
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
    'Public pages may be used for search indexing, citation, answer grounding, and user-requested retrieval. CardNav does not authorize model-training or bulk dataset crawling; see robots.txt for crawler-specific rules.',
    '',
  ].join('\n');
}
