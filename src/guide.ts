/**
 * 文件说明: 在构建期扫描 public-web/guide 下的 Markdown 文档，生成向导列表、详情内容和站内跳转链接。
 * 对应文档: public-web/guide
 */
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';

const cardnavSiteOrigin = 'https://cardnav.xyz';
const guideUrlClickEventName = 'guide-url-click';

export type GuideArticle = {
  slug: string;
  title: string;
  description: string;
  sourcePath: string;
  order: number;
  parentLink: GuideParentLink | null;
  nextLink: GuideLinkRef | null;
};

export type RenderedGuideArticle = GuideArticle & {
  markdown: string;
  html: string;
};

export type GuideNavItem = {
  article: GuideArticle;
  depth: number;
};

export type GuideParentLink = {
  slug: string;
  title?: string;
  parent?: GuideParentLink | null;
};

export type GuideLinkRef = {
  slug: string;
  title?: string;
};

const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});

const rawGuideMarkdownModules = import.meta.glob('../guide/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

type FrontmatterData = {
  title?: unknown;
  description?: unknown;
  parent?: unknown;
  next?: unknown;
};

type ParsedGuideDocument = {
  fileName: string;
  sourcePath: string;
  stem: string;
  slug: string;
  order: number;
  markdown: string;
  title: string;
  description: string;
  directParentLink: GuideParentLink | null;
  directNextLink: GuideLinkRef | null;
};

function fileNameFromModulePath(modulePath: string) {
  return modulePath.split('/').pop() || modulePath;
}

function stemFromFileName(fileName: string) {
  return fileName.replace(/\.md$/u, '');
}

function orderFromStem(stem: string) {
  const match = stem.match(/^(\d+)-/u);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function slugFromStem(stem: string) {
  return stem.replace(/^\d+-/u, '');
}

function asNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseGuideParentLink(value: unknown): GuideParentLink | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const rawParent = value as Record<string, unknown>;
  const slug = asNonEmptyString(rawParent.slug);
  if (!slug) {
    return null;
  }
  const title = asNonEmptyString(rawParent.title) ?? undefined;
  const parent = parseGuideParentLink(rawParent.parent);
  return {
    slug,
    title,
    parent,
  };
}

function parseGuideLinkRef(value: unknown): GuideLinkRef | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const rawLink = value as Record<string, unknown>;
  const slug = asNonEmptyString(rawLink.slug);
  if (!slug) {
    return null;
  }
  const title = asNonEmptyString(rawLink.title) ?? undefined;
  return {
    slug,
    title,
  };
}

function resolveParentLink(
  slug: string,
  directParentBySlug: Map<string, GuideParentLink | null>,
  documentBySlug: Map<string, ParsedGuideDocument>,
  visited = new Set<string>(),
): GuideParentLink | null {
  const directParent = directParentBySlug.get(slug) ?? null;
  if (!directParent) {
    return null;
  }
  const parentSlug = directParent.slug;
  if (visited.has(parentSlug)) {
    return {
      slug: parentSlug,
      title: directParent.title,
      parent: null,
    };
  }
  const nextVisited = new Set(visited);
  nextVisited.add(slug);
  const parentDocument = documentBySlug.get(parentSlug);
  const inheritedTitle = parentDocument?.title;
  return {
    slug: parentSlug,
    title: directParent.title || inheritedTitle,
    parent: resolveParentLink(parentSlug, directParentBySlug, documentBySlug, nextVisited),
  };
}

function collectDescendants(
  parentSlug: string | null,
  childrenByParentSlug: Map<string | null, ParsedGuideDocument[]>,
  depth: number,
): GuideNavItem[] {
  const children = childrenByParentSlug.get(parentSlug) ?? [];
  return children.flatMap(child => ([
    {
      article: {
        slug: child.slug,
        title: child.title,
        description: child.description,
        sourcePath: child.sourcePath,
        order: child.order,
        parentLink: null,
        nextLink: null,
      },
      depth,
    },
    ...collectDescendants(child.slug, childrenByParentSlug, depth + 1),
  ]));
}

function titleFromMarkdown(markdown: string, fallback: string) {
  const match = markdown.match(/^#\s+(.+)$/mu);
  return match?.[1]?.trim() || fallback;
}

function descriptionFromMarkdown(markdown: string) {
  const lines = markdown.split('\n');
  let inCodeBlock = false;
  let collecting = false;
  const paragraphLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      if (collecting) break;
      continue;
    }
    if (inCodeBlock) continue;
    if (!trimmed) {
      if (collecting && paragraphLines.length) break;
      continue;
    }
    if (
      trimmed.startsWith('#') ||
      trimmed.startsWith('>') ||
      trimmed.startsWith('- ') ||
      trimmed.startsWith('* ') ||
      /^\d+\.\s/u.test(trimmed) ||
      trimmed.startsWith('|') ||
      /^```/u.test(trimmed)
    ) {
      if (collecting && paragraphLines.length) break;
      continue;
    }
    collecting = true;
    paragraphLines.push(trimmed);
  }

  return paragraphLines.join(' ').trim();
}

function rewriteMarkdownLinks(markdown: string, slugByFileName: Map<string, string>) {
  return markdown
    .replace(/\]\((\.\/[^)#]+\.md)(#[^)]+)?\)/gu, (_match, relativePath: string, hash = '') => {
      const fileName = relativePath.replace('./', '');
      const slug = slugByFileName.get(fileName);
      if (!slug) {
        return `](${relativePath}${hash})`;
      }
      return `](/guide/${slug}${hash})`;
    })
    .replace(/\]\((https:\/\/cardnav\.xyz[^)\s]*)\)/gu, (_match, absoluteUrl: string) => {
      try {
        const url = new URL(absoluteUrl);
        if (url.origin !== cardnavSiteOrigin) {
          return `](${absoluteUrl})`;
        }
        const relativeUrl = `${url.pathname}${url.search}${url.hash}` || '/';
        return `](${relativeUrl || '/'})`;
      } catch {
        return `](${absoluteUrl})`;
      }
    });
}

function rewriteRenderedHtmlLinks(html: string) {
  let processed = html.replace(/href="https:\/\/cardnav\.xyz([^"]*)"/gu, (_match, pathAndSuffix: string) => {
    const normalized = pathAndSuffix || '/';
    return `href="${normalized}"`;
  });

  // Open links that do not target /guide or # in a new tab
  processed = processed.replace(/<a\s+([^>]*?)href="([^"]+)"([^>]*?)>/gu, (match, prefix, href, suffix) => {
    if (href.startsWith('/guide') || href.startsWith('#')) {
      return match;
    }
    if (prefix.includes('target=') || suffix.includes('target=')) {
      return match;
    }
    return `<a ${prefix}href="${href}"${suffix} target="_blank" rel="noopener noreferrer">`;
  });

  return processed;
}

function normalizeGuideSourcePage(slug: string) {
  return slug ? `/guide/${slug}` : '/guide';
}

function normalizeGuideTargetPage(href: string, sourcePage: string) {
  if (href.startsWith('#')) {
    return `${sourcePage}${href}`;
  }

  if (href.startsWith('/')) {
    return href;
  }

  try {
    const url = new URL(href, cardnavSiteOrigin);
    if (url.origin === cardnavSiteOrigin) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
    return href;
  } catch {
    return href;
  }
}

function buildGuideLinkTrackingAttributes(href: string, sourcePage: string) {
  const targetPage = normalizeGuideTargetPage(href, sourcePage);
  return [
    `data-umami-event="${guideUrlClickEventName}"`,
    `data-umami-event-source-page="${escapeHtml(sourcePage)}"`,
    `data-umami-event-target-page="${escapeHtml(targetPage)}"`,
    `data-umami-event-url="${escapeHtml(href)}"`,
  ].join(' ');
}

function addGuideLinkTrackingToRenderedHtml(html: string, sourcePage: string) {
  return html.replace(/<a\s+([^>]*?)href="([^"]+)"([^>]*?)>/gu, (match, prefix, href, suffix) => {
    if (prefix.includes('data-umami-event=') || suffix.includes('data-umami-event=')) {
      return match;
    }
    const trackingAttributes = buildGuideLinkTrackingAttributes(href, sourcePage);
    return `<a ${prefix}href="${href}"${suffix} ${trackingAttributes}>`;
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function renderMarkdownFragment(markdown: string, slugByFileName: Map<string, string>) {
  return rewriteRenderedHtmlLinks(markdownRenderer.render(rewriteMarkdownLinks(markdown, slugByFileName)));
}

function parseCommentAttributes(line: string) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('<!--') || !trimmed.endsWith('-->')) {
    return null;
  }
  const commentContent = trimmed.replace(/^<!--\s*/u, '').replace(/\s*-->$/u, '');
  const attrs = new Map<string, string>();
  const attrRegex = /([a-zA-Z0-9_-]+)="([^"]*)"/gu;
  let attrMatch;
  while ((attrMatch = attrRegex.exec(commentContent)) !== null) {
    attrs.set(attrMatch[1], attrMatch[2]);
  }
  return attrs;
}

type InlineMarkdownCard = {
  title: string;
  badge?: string;
  markdown: string;
};

function renderInlineCardGrid(cards: InlineMarkdownCard[], slugByFileName: Map<string, string>, sourcePage: string) {
  if (cards.length === 0) {
    return '';
  }

  const cardsHtml = cards.map(card => {
    const badgeHtml = card.badge
      ? `<span class="guide-badge">${escapeHtml(card.badge)}</span>`
      : '<span></span>';

    const bodyHtml = addGuideLinkTrackingToRenderedHtml(
      renderMarkdownFragment(card.markdown, slugByFileName),
      sourcePage,
    );
    return [
      '<article class="guide-card">',
      `<div class="guide-card-top">${badgeHtml}</div>`,
      `<h3 class="guide-card-title">${escapeHtml(card.title)}</h3>`,
      `<div class="guide-article">${bodyHtml}</div>`,
      '</article>',
    ].join('');
  }).join('');

  return `<div class="guide-grid">${cardsHtml}</div>`;
}

function renderDocumentHtmlWithInlineCards(markdown: string, slugByFileName: Map<string, string>, sourcePage: string) {
  const lines = markdown.split(/\r?\n/u);
  const htmlParts: string[] = [];
  const introLines: string[] = [];
  const sections: Array<{ title: string; badge?: string; isCard: boolean; bodyLines: string[] }> = [];
  let currentSection: { title: string; badge?: string; isCard: boolean; bodyLines: string[] } | null = null;

  const pushCurrentSection = () => {
    if (!currentSection) {
      return;
    }
    let commentLineIndex = -1;
    for (let index = 0; index < currentSection.bodyLines.length; index += 1) {
      if (currentSection.bodyLines[index].trim() === '') {
        continue;
      }
      commentLineIndex = index;
      break;
    }
    if (commentLineIndex !== -1) {
      const attrs = parseCommentAttributes(currentSection.bodyLines[commentLineIndex]);
      if (attrs) {
        currentSection.isCard = true;
        currentSection.badge = currentSection.badge || attrs.get('badge') || undefined;
        currentSection.bodyLines.splice(commentLineIndex, 1);
      }
    }
    sections.push(currentSection);
    currentSection = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('## ')) {
      pushCurrentSection();
      const headingContent = trimmed.replace(/^##\s+/u, '').trim();
      const commentMatch = headingContent.match(/<!--\s*([\s\S]*?)\s*-->/u);
      const title = headingContent.replace(/<!--\s*[\s\S]*?\s*-->/gu, '').trim();
      const attrs = commentMatch ? parseCommentAttributes(`<!-- ${commentMatch[1]} -->`) : null;
      currentSection = {
        title,
        badge: attrs?.get('badge') || undefined,
        isCard: commentMatch !== null,
        bodyLines: [],
      };
      continue;
    }

    if (currentSection) {
      currentSection.bodyLines.push(line);
    } else {
      introLines.push(line);
    }
  }

  pushCurrentSection();

  if (introLines.length > 0) {
    htmlParts.push(addGuideLinkTrackingToRenderedHtml(
      renderMarkdownFragment(introLines.join('\n'), slugByFileName),
      sourcePage,
    ));
  }

  let pendingCards: InlineMarkdownCard[] = [];
  const flushPendingCards = () => {
    if (pendingCards.length === 0) {
      return;
    }
    htmlParts.push(renderInlineCardGrid(pendingCards, slugByFileName, sourcePage));
    pendingCards = [];
  };

  for (const section of sections) {
    if (section.isCard) {
      pendingCards.push({
        title: section.title,
        badge: section.badge,
        markdown: section.bodyLines.join('\n').trim(),
      });
      continue;
    }

    flushPendingCards();
    const sectionMarkdown = [`## ${section.title}`, ...section.bodyLines].join('\n');
    htmlParts.push(addGuideLinkTrackingToRenderedHtml(
      renderMarkdownFragment(sectionMarkdown, slugByFileName),
      sourcePage,
    ));
  }

  flushPendingCards();
  return htmlParts.join('');
}

const rawGuideDocuments: ParsedGuideDocument[] = Object.entries(rawGuideMarkdownModules)
  .map(([modulePath, rawMarkdown]) => {
    const fileName = fileNameFromModulePath(modulePath);
    const stem = stemFromFileName(fileName);
    const slug = slugFromStem(stem);
    const fallbackTitle = slugFromStem(stem).replace(/-/gu, ' ');
    const { content, data } = matter(rawMarkdown);
    const frontmatter = (data ?? {}) as FrontmatterData;
    const frontmatterTitle = asNonEmptyString(frontmatter.title);
    const frontmatterDescription = asNonEmptyString(frontmatter.description);
    return {
      fileName,
      sourcePath: modulePath,
      stem,
      slug,
      order: orderFromStem(stem),
      markdown: content,
      title: frontmatterTitle || titleFromMarkdown(content, fallbackTitle),
      description: frontmatterDescription || descriptionFromMarkdown(content),
      directParentLink: parseGuideParentLink(frontmatter.parent),
      directNextLink: parseGuideLinkRef(frontmatter.next),
    };
  })
  .sort((left, right) => {
    if (left.order !== right.order) {
      return left.order - right.order;
    }
    return left.stem.localeCompare(right.stem, 'zh-Hans-CN');
  });

const slugByFileName = new Map(rawGuideDocuments.map(item => [item.fileName, item.slug]));
const documentBySlug = new Map(rawGuideDocuments.map(item => [item.slug, item]));
const directParentBySlug = new Map(rawGuideDocuments.map(item => [item.slug, item.directParentLink]));

export const renderedGuideArticles: RenderedGuideArticle[] = rawGuideDocuments.map(item => {
  const normalizedMarkdown = rewriteMarkdownLinks(item.markdown, slugByFileName);

  return {
    slug: item.slug,
    title: item.title,
    description: item.description,
    sourcePath: item.sourcePath,
    order: item.order,
    parentLink: resolveParentLink(item.slug, directParentBySlug, documentBySlug),
    nextLink: (() => {
      const nextSlug = item.directNextLink?.slug;
      if (!nextSlug) {
        return null;
      }
      const nextDocument = documentBySlug.get(nextSlug);
      return {
        slug: nextSlug,
        title: item.directNextLink?.title || nextDocument?.title,
      };
    })(),
    markdown: normalizedMarkdown,
    html: renderDocumentHtmlWithInlineCards(
      item.markdown,
      slugByFileName,
      normalizeGuideSourcePage(item.slug),
    ),
  };
});

export const guideArticles: GuideArticle[] = renderedGuideArticles.map(({
  slug,
  title,
  description,
  sourcePath,
  order,
  parentLink,
  nextLink,
}) => ({
  slug,
  title,
  description,
  sourcePath,
  order,
  parentLink,
  nextLink,
}));

export const defaultGuideArticle = renderedGuideArticles[0] ?? null;

const articleBySlug = new Map(guideArticles.map(article => [article.slug, article]));
const childrenByParentSlug = new Map<string | null, ParsedGuideDocument[]>();

for (const item of rawGuideDocuments) {
  const parentSlug = item.directParentLink?.slug ?? null;
  const existingChildren = childrenByParentSlug.get(parentSlug) ?? [];
  existingChildren.push(item);
  existingChildren.sort((left, right) => {
    if (left.order !== right.order) {
      return left.order - right.order;
    }
    return left.stem.localeCompare(right.stem, 'zh-Hans-CN');
  });
  childrenByParentSlug.set(parentSlug, existingChildren);
}

export const guideNavItems: GuideNavItem[] = collectDescendants(null, childrenByParentSlug, 0).map(item => ({
  article: articleBySlug.get(item.article.slug) ?? item.article,
  depth: item.depth,
}));

export function findGuideArticle(slug: string) {
  return renderedGuideArticles.find(item => item.slug === slug) ?? null;
}
