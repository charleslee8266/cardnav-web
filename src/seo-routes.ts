/**
 * 文件说明: 维护公开站点可索引页面清单，并生成 sitemap、robots 和 llms.txt 内容。
 */
import type { GuideArticle } from './guide.js';
import type { ModelLeaderboardGroup } from './model-leaderboard.js';
import type { OfficialPriceGroup } from './official-price.js';

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
    description: 'AI 大模型使用导航，汇总模型排行榜、官方订阅比价、AI 账号商家、库存、价格筛选、向导和工具入口。',
    changefreq: 'daily',
  },
  {
    pathname: '/model-leaderboard',
    title: '模型排行榜',
    description: '查看当前四类任务下的大模型能力排行榜，包括编程、创意写作、数学和文生图。',
    changefreq: 'daily',
  },
  {
    pathname: '/official-price',
    title: '官方订阅比价',
    description: '对比 ChatGPT Plus, Claude Pro, Gemini Advanced 等 AI 官方订阅在世界各地区（如美国、土耳其、日本等）的实时价格与汇率折算，助你选择最划算的购买区域。',
    changefreq: 'daily',
  },
  {
    pathname: '/tools',
    title: '工具集',
    description: '与 AI 账号、订阅和导入格式相关的小工具集合。',
    changefreq: 'weekly',
  },
  {
    pathname: '/tools/session-converter',
    title: 'ChatGPT Session 转换工具',
    description: '在浏览器本地转换 ChatGPT Web session、Codex auth.json 和 9Router OAuth JSON 等账号凭证格式。',
    changefreq: 'monthly',
  },
  {
    pathname: '/tools/ip-purity',
    title: 'IP 纯净度检测',
    description: '检测公网 IPv4 的代理、VPN、Tor、机房和滥用风险信号，帮助注册、登录和支付前筛掉高风险出口。',
    changefreq: 'weekly',
  },
  {
    pathname: '/guide',
    title: '向导',
    description: 'AI 账号购买、商家选择和虚拟商品下单前的判断方法。',
    changefreq: 'weekly',
  },
  {
    pathname: '/about',
    title: '关于我们',
    description: '了解卡网大全为什么会被做出来，以及它想为 AI 账号购买用户和商家解决什么问题。',
    changefreq: 'monthly',
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

export async function loadGuideArticles() {
  const guideModule = await import('./guide.js');
  return guideModule.guideArticles;
}

export function getPublicSeoRoutes(guideRoutes: GuideArticle[] = []): PublicSeoRoute[] {
  return [
    ...staticPublicSeoRoutes,
    ...guideRoutes.map(article => ({
      pathname: `/guide/${article.slug}`,
      title: article.title,
      description: article.description,
      changefreq: 'monthly' as const,
    })),
  ];
}

export function buildOfficialPriceSeoRoutes(groups: OfficialPriceGroup[]): PublicSeoRoute[] {
  return groups.map(group => ({
    pathname: group.pathname,
    title: `${group.displayName} 官方订阅价格对比`,
    description: `查看 ${group.displayName} 官方订阅在不同国家和地区的本地价格、币种和人民币折算结果，按折算价格由低到高对比。`,
    changefreq: 'daily' as const,
  }));
}

export function buildModelLeaderboardSeoRoutes(groups: ModelLeaderboardGroup[]): PublicSeoRoute[] {
  return groups.map(group => ({
    pathname: group.pathname,
    title: `${group.taskLabel}模型排行榜`,
    description: `查看当前 ${group.taskLabel} 任务下的大模型能力排行榜，包括模型排名和评分。`,
    changefreq: 'daily' as const,
  }));
}

export function getPublicSeoRoutesWithDynamicPages(params: {
  officialPriceGroups?: OfficialPriceGroup[];
  modelLeaderboardGroups?: ModelLeaderboardGroup[];
  guideRoutes?: GuideArticle[];
} = {}): PublicSeoRoute[] {
  return normalizePublicSeoRoutes([
    ...getPublicSeoRoutes(params.guideRoutes),
    ...buildOfficialPriceSeoRoutes(params.officialPriceGroups ?? []),
    ...buildModelLeaderboardSeoRoutes(params.modelLeaderboardGroups ?? []),
  ]);
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

export function buildSitemapXml(baseUrlInput: string, routes = getPublicSeoRoutes()) {
  const items = normalizePublicSeoRoutes(routes)
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
  const routeLines = normalizePublicSeoRoutes(routes)
    .map(route => `- [${route.title}](${resolvePublicUrl(baseUrl, route.pathname)}): ${route.description}`)
    .join('\n');
  return [
    '# CardNav / 卡网大全',
    '',
    '卡网大全是一个中文公开导航站点，聚合 AI 账号商家、商品、库存状态、价格、提交入口和购买前判断内容。',
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
    'Public pages may be used for search indexing, citation, answer grounding, and user-requested retrieval. 卡网大全 does not authorize model-training or bulk dataset crawling; see robots.txt for crawler-specific rules.',
    '',
  ].join('\n');
}
