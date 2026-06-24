/**
 * 文件说明: 加载并渲染公开站点普通 Markdown 内容页，供关于、隐私和免责声明复用。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
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

function isPageContentRoot(candidate: string) {
  return existsSync(path.join(candidate, defaultLocale, 'about.md'));
}

function findPageContentRoot() {
  const visited = new Set<string>();
  let currentDir = process.cwd();
  while (!visited.has(currentDir)) {
    visited.add(currentDir);
    const directCandidate = path.join(currentDir, 'content/pages');
    if (isPageContentRoot(directCandidate)) return directCandidate;

    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const nestedCandidate = path.join(currentDir, entry.name, 'content/pages');
      if (isPageContentRoot(nestedCandidate)) return nestedCandidate;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }
  throw new Error('Unable to locate public page content markdown root');
}

function loadPageContentModulesFromFiles() {
  const contentRoot = findPageContentRoot();
  const modules: Record<string, string> = {};
  for (const localeDirName of readdirSync(contentRoot, { withFileTypes: true })) {
    if (!localeDirName.isDirectory()) continue;
    const localeDir = path.join(contentRoot, localeDirName.name);
    for (const fileName of readdirSync(localeDir)) {
      if (!fileName.endsWith('.md')) continue;
      modules[`../content/pages/${localeDirName.name}/${fileName}`] = readFileSync(path.join(localeDir, fileName), 'utf8');
    }
  }
  return modules;
}

const rawPageContentModules = import.meta.env?.PROD
  ? import.meta.glob('../content/pages/*/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>
  : loadPageContentModulesFromFiles();

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
