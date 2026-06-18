/**
 * 文件说明: 加载并渲染公开站点普通 Markdown 内容页，供关于、隐私和免责声明复用。
 */
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';
import { defaultLocale, type Locale } from './i18n/config.js';

export type PageContentSlug = 'about' | 'privacy' | 'disclaimer';

export type RenderedPageContent = {
  slug: PageContentSlug;
  title: string;
  description: string;
  markdown: string;
  html: string;
};

type PageContentFrontmatter = {
  title?: unknown;
  description?: unknown;
};

const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});

const rawPageContentModules = import.meta.glob('../content/pages/*/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function titleFromMarkdown(markdown: string, fallback: string) {
  const match = markdown.match(/^#\s+(.+)$/mu);
  return match?.[1]?.trim() || fallback;
}

function descriptionFromMarkdown(markdown: string) {
  const lines = markdown.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    return trimmed;
  }
  return '';
}

function normalizeFrontmatterString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function modulePathFor(locale: Locale, slug: PageContentSlug) {
  return `../content/pages/${locale}/${slug}.md`;
}

export function loadPageContent(slug: PageContentSlug, locale: Locale = defaultLocale): RenderedPageContent {
  const rawMarkdown = rawPageContentModules[modulePathFor(locale, slug)]
    ?? rawPageContentModules[modulePathFor(defaultLocale, slug)];
  if (!rawMarkdown) {
    throw new Error(`Missing page content markdown: ${slug}`);
  }

  const parsed = matter(rawMarkdown);
  const data = parsed.data as PageContentFrontmatter;
  const markdown = parsed.content.trim();
  return {
    slug,
    title: normalizeFrontmatterString(data.title) ?? titleFromMarkdown(markdown, slug),
    description: normalizeFrontmatterString(data.description) ?? descriptionFromMarkdown(markdown),
    markdown,
    html: markdownRenderer.render(markdown),
  };
}
