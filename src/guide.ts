/**
 * 文件说明: 在构建期扫描 content/guide 下的 Markdown 文档，生成向导列表、详情内容和站内跳转链接。
 */
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';
import {
  guideLinkTargetAttributes,
  normalizeGuideHref,
  normalizeGuideTargetPage,
  rewriteGuideMarkdownLinks,
  rewriteGuideRenderedHtmlLinks,
} from './guide-link-rules.js';
import { defaultLocale, isLocale, supportedLocales, type Locale } from './i18n/config.js';

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

const rawGuideMarkdownModules = import.meta.glob('../content/guide/*/*.md', {
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
  locale: Locale;
  fileName: string;
  sourcePath: string;
  stem: string;
  slug: string;
  order: number;
  markdown: string;
  title: string;
  description: string;
  directParentSlug: string | null;
  directNextSlug: string | null;
};

type GuideCollection = {
  renderedGuideArticles: RenderedGuideArticle[];
  guideArticles: GuideArticle[];
  defaultGuideArticle: RenderedGuideArticle | null;
  guideNavItems: GuideNavItem[];
};

function fileNameFromModulePath(modulePath: string) {
  return modulePath.split('/').pop() || modulePath;
}

function localeFromModulePath(modulePath: string): Locale | null {
  const match = modulePath.match(/\/content\/guide\/([^/]+)\//u);
  const locale = match?.[1];
  return locale && isLocale(locale) ? locale : null;
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

function parseGuideSlugRef(value: unknown): string | null {
  return asNonEmptyString(value);
}

function resolveParentLink(
  slug: string,
  directParentBySlug: Map<string, string | null>,
  documentBySlug: Map<string, ParsedGuideDocument>,
  visited = new Set<string>(),
): GuideParentLink | null {
  const parentSlug = directParentBySlug.get(slug) ?? null;
  if (!parentSlug) {
    return null;
  }
  if (visited.has(parentSlug)) {
    return {
      slug: parentSlug,
      title: documentBySlug.get(parentSlug)?.title,
      parent: null,
    };
  }
  const nextVisited = new Set(visited);
  nextVisited.add(slug);
  const parentDocument = documentBySlug.get(parentSlug);
  return {
    slug: parentSlug,
    title: parentDocument?.title,
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

function normalizeGuideSourcePage(slug: string) {
  return slug ? `/guide/${slug}` : '/guide';
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
  return rewriteGuideRenderedHtmlLinks(markdownRenderer.render(rewriteGuideMarkdownLinks(markdown, slugByFileName)));
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
  icon?: string;
  imageAspect?: string;
  image?: string;
  imageAlt?: string;
  markdown: string;
};

const guideCardIconPaths: Record<string, string> = {
  api: '<path d="M7 8 3 12l4 4"/><path d="m17 8 4 4-4 4"/><path d="m14 4-4 16"/>',
  bank: '<path d="m3 10 9-6 9 6"/><path d="M5 10v8"/><path d="M9 10v8"/><path d="M15 10v8"/><path d="M19 10v8"/><path d="M4 18h16"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M7 15h4"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.6L20 8H6"/>',
  cash: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9v.01"/><path d="M18 15v.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  gift: '<path d="M20 12v8H4v-8"/><path d="M2 8h20v4H2z"/><path d="M12 8v12"/><path d="M12 8H8.5A2.5 2.5 0 1 1 11 5.5V8Z"/><path d="M12 8h3.5A2.5 2.5 0 1 0 13 5.5V8Z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a13 13 0 0 1 0 18"/><path d="M12 3a13 13 0 0 0 0 18"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8"/><path d="m15 8 2 2"/><path d="m17 6 2 2"/>',
  model: '<path d="M12 3 4 7l8 4 8-4-8-4Z"/><path d="m4 12 8 4 8-4"/><path d="m4 17 8 4 8-4"/>',
  phone: '<path d="M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M11 18h2"/>',
  support: '<path d="M4 12a8 8 0 0 1 16 0"/><path d="M4 12v4a2 2 0 0 0 2 2h2v-6H4Z"/><path d="M20 12v4a2 2 0 0 1-2 2h-2v-6h4Z"/><path d="M13 20h2a5 5 0 0 0 5-5"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/>',
  route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h3a3 3 0 0 0 0-6h2a3 3 0 0 0 3-3V8"/>',
  toolbox: '<path d="M9 6V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1"/><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 12h18"/><path d="M12 10v4"/>',
  'shield-alert': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="M12 8v5"/><path d="M12 17h.01"/>',
  vpn: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-5"/>',
  vps: '<rect x="4" y="4" width="16" height="6" rx="2"/><rect x="4" y="14" width="16" height="6" rx="2"/><path d="M8 7h.01"/><path d="M8 17h.01"/>',
};

function renderGuideCardIcon(icon: string | undefined) {
  if (!icon) {
    return '';
  }
  const iconPath = guideCardIconPaths[icon];
  if (!iconPath) {
    return '';
  }
  return `<span class="guide-card-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${iconPath}</svg></span>`;
}

function renderGuideCardAction(label: string | undefined) {
  if (!label) {
    return '';
  }
  return `<span class="guide-card-action"><span>${escapeHtml(label)}</span><span aria-hidden="true">→</span></span>`;
}

function resolveGuideCardHref(href: string | undefined, slugByFileName: Map<string, string>) {
  if (!href) {
    return null;
  }
  if (href.startsWith('./') && href.endsWith('.md')) {
    const fileName = href.replace('./', '');
    const slug = slugByFileName.get(fileName);
    return slug ? `/guide/${slug}` : href;
  }
  return normalizeGuideHref(href);
}

function normalizeGuideImageSrc(src: string) {
  if (src.startsWith('../../../public/')) {
    return `/${src.replace('../../../public/', '')}`;
  }
  if (src.startsWith('../../public/')) {
    return `/${src.replace('../../public/', '')}`;
  }
  if (src.startsWith('../public/')) {
    return `/${src.replace('../public/', '')}`;
  }
  if (src.startsWith('/')) {
    return src;
  }
  return src;
}

function extractLeadingMarkdownImage(markdown: string) {
  const lines = markdown.split(/\r?\n/u);
  let imageLineIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() === '') {
      continue;
    }
    imageLineIndex = index;
    break;
  }
  if (imageLineIndex === -1) {
    return {
      markdown,
      image: undefined,
      imageAlt: undefined,
    };
  }
  const imageMatch = lines[imageLineIndex].trim().match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/u);
  if (!imageMatch) {
    return {
      markdown,
      image: undefined,
      imageAlt: undefined,
    };
  }
  lines.splice(imageLineIndex, 1);
  return {
    markdown: lines.join('\n').trim(),
    image: normalizeGuideImageSrc(imageMatch[2]),
    imageAlt: imageMatch[1],
  };
}

function extractTrailingCardActionLink(markdown: string) {
  const lines = markdown.split(/\r?\n/u);
  let linkLineIndex = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].trim() === '') {
      continue;
    }
    linkLineIndex = index;
    break;
  }
  if (linkLineIndex === -1) {
    return {
      markdown,
      href: undefined,
    };
  }
  const linkMatch = lines[linkLineIndex].trim().match(/^\[([^\]]+)\]\(([^)]+)\)$/u);
  if (!linkMatch) {
    return {
      markdown,
      href: undefined,
    };
  }
  lines.splice(linkLineIndex, 1);
  return {
    markdown: lines.join('\n').trim(),
    label: linkMatch[1],
    href: linkMatch[2],
  };
}

function normalizeGuideImageAspect(value: string | undefined) {
  if (!value) {
    return null;
  }
  const normalized = value.trim().replace(/\s+/gu, '');
  const aspectMatch = normalized.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/u);
  if (!aspectMatch) {
    return null;
  }
  return `${aspectMatch[1]} / ${aspectMatch[2]}`;
}

function renderInlineCardGrid(cards: InlineMarkdownCard[], slugByFileName: Map<string, string>, sourcePage: string) {
  if (cards.length === 0) {
    return '';
  }

  const cardsHtml = cards.map(card => {
    const extractedImage = extractLeadingMarkdownImage(card.markdown);
    const extractedActionLink = extractTrailingCardActionLink(extractedImage.markdown);
    const href = resolveGuideCardHref(extractedActionLink.href, slugByFileName);
    const tagName = href ? 'a' : 'article';
    const hrefAttr = href ? ` href="${escapeHtml(href)}"` : '';
    const externalAttrs = extractedActionLink.href ? guideLinkTargetAttributes(extractedActionLink.href) : '';
    const trackingAttrs = href ? ` ${buildGuideLinkTrackingAttributes(href, sourcePage)}` : '';
    const cardClassName = href ? 'guide-card guide-card-clickable' : 'guide-card';
    const iconHtml = renderGuideCardIcon(card.icon);
    const badgeHtml = card.badge
      ? `<span class="guide-badge">${escapeHtml(card.badge)}</span>`
      : '<span></span>';
    const cardImage = card.image || extractedImage.image;
    const cardImageAlt = card.imageAlt || extractedImage.imageAlt || card.title;
    const imageAspect = normalizeGuideImageAspect(card.imageAspect);
    const imageFrameStyle = imageAspect ? ` style="--guide-card-image-aspect: ${escapeHtml(imageAspect)}"` : '';
    const imageHtml = cardImage
      ? `<span class="guide-card-image-frame"${imageFrameStyle}><img src="${escapeHtml(cardImage)}" alt="${escapeHtml(cardImageAlt)}" loading="lazy" class="guide-card-image" /></span>`
      : '';

    const bodyHtml = addGuideLinkTrackingToRenderedHtml(
      renderMarkdownFragment(extractedActionLink.markdown, slugByFileName),
      sourcePage,
    );
    const actionHtml = renderGuideCardAction(extractedActionLink.label);
    return [
      `<${tagName} class="${cardClassName}"${hrefAttr}${externalAttrs}${trackingAttrs}>`,
      `<div class="guide-card-top">${badgeHtml}${iconHtml}</div>`,
      imageHtml,
      `<h3 class="guide-card-title">${escapeHtml(card.title)}</h3>`,
      `<div class="guide-article">${bodyHtml}</div>`,
      actionHtml,
      `</${tagName}>`,
    ].join('');
  }).join('');

  return `<div class="guide-grid">${cardsHtml}</div>`;
}

function renderDocumentHtmlWithInlineCards(markdown: string, slugByFileName: Map<string, string>, sourcePage: string) {
  const lines = markdown.split(/\r?\n/u);
  const htmlParts: string[] = [];
  const introLines: string[] = [];
  const sections: Array<{ title: string; badge?: string; icon?: string; imageAspect?: string; image?: string; imageAlt?: string; isCard: boolean; bodyLines: string[] }> = [];
  let currentSection: { title: string; badge?: string; icon?: string; imageAspect?: string; image?: string; imageAlt?: string; isCard: boolean; bodyLines: string[] } | null = null;

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
        currentSection.icon = currentSection.icon || attrs.get('icon') || undefined;
        currentSection.imageAspect = currentSection.imageAspect || attrs.get('imageAspect') || undefined;
        currentSection.image = currentSection.image || attrs.get('image') || undefined;
        currentSection.imageAlt = currentSection.imageAlt || attrs.get('imageAlt') || undefined;
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
        icon: attrs?.get('icon') || undefined,
        imageAspect: attrs?.get('imageAspect') || undefined,
        image: attrs?.get('image') || undefined,
        imageAlt: attrs?.get('imageAlt') || undefined,
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
        icon: section.icon,
        imageAspect: section.imageAspect,
        image: section.image,
        imageAlt: section.imageAlt,
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
  .flatMap(([modulePath, rawMarkdown]) => {
    const locale = localeFromModulePath(modulePath);
    if (!locale) {
      return [];
    }
    return [[locale, modulePath, rawMarkdown] as const];
  })
  .map(([locale, sourcePath, sourceMarkdown]) => {
    const fileName = fileNameFromModulePath(sourcePath);
    const stem = stemFromFileName(fileName);
    const slug = slugFromStem(stem);
    const fallbackTitle = slugFromStem(stem).replace(/-/gu, ' ');
    const { content, data } = matter(sourceMarkdown);
    const frontmatter = (data ?? {}) as FrontmatterData;
    const frontmatterTitle = asNonEmptyString(frontmatter.title);
    const frontmatterDescription = asNonEmptyString(frontmatter.description);
    return {
      locale,
      fileName,
      sourcePath,
      stem,
      slug,
      order: orderFromStem(stem),
      markdown: content,
      title: frontmatterTitle || titleFromMarkdown(content, fallbackTitle),
      description: frontmatterDescription || descriptionFromMarkdown(content),
      directParentSlug: parseGuideSlugRef(frontmatter.parent),
      directNextSlug: parseGuideSlugRef(frontmatter.next),
    };
  })
  .sort((left, right) => {
    if (left.order !== right.order) {
      return left.order - right.order;
    }
    return left.stem.localeCompare(right.stem, 'zh-Hans-CN');
  });

function buildGuideCollection(localeDocuments: ParsedGuideDocument[]): GuideCollection {
  const slugByFileName = new Map(localeDocuments.map(item => [item.fileName, item.slug]));
  const documentBySlug = new Map(localeDocuments.map(item => [item.slug, item]));
  const directParentBySlug = new Map(localeDocuments.map(item => [item.slug, item.directParentSlug]));

  const renderedGuideArticles: RenderedGuideArticle[] = localeDocuments.map(item => {
    const normalizedMarkdown = rewriteGuideMarkdownLinks(item.markdown, slugByFileName);

    return {
      slug: item.slug,
      title: item.title,
      description: item.description,
      sourcePath: item.sourcePath,
      order: item.order,
      parentLink: resolveParentLink(item.slug, directParentBySlug, documentBySlug),
      nextLink: (() => {
        const nextSlug = item.directNextSlug;
        if (!nextSlug) {
          return null;
        }
        const nextDocument = documentBySlug.get(nextSlug);
        return {
          slug: nextSlug,
          title: nextDocument?.title,
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

  const guideArticles: GuideArticle[] = renderedGuideArticles.map(({
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

  const articleBySlug = new Map(guideArticles.map(article => [article.slug, article]));
  const childrenByParentSlug = new Map<string | null, ParsedGuideDocument[]>();

  for (const item of localeDocuments) {
    const parentSlug = item.directParentSlug;
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

  const guideNavItems: GuideNavItem[] = collectDescendants(null, childrenByParentSlug, 0).map(item => ({
    article: articleBySlug.get(item.article.slug) ?? item.article,
    depth: item.depth,
  }));

  return {
    renderedGuideArticles,
    guideArticles,
    defaultGuideArticle: renderedGuideArticles[0] ?? null,
    guideNavItems,
  };
}

const guideDocumentsByLocale = new Map<Locale, ParsedGuideDocument[]>();

for (const item of rawGuideDocuments) {
  const existingDocuments = guideDocumentsByLocale.get(item.locale) ?? [];
  existingDocuments.push(item);
  guideDocumentsByLocale.set(item.locale, existingDocuments);
}

function mergeGuideDocumentsWithDefault(localeDocuments: ParsedGuideDocument[]) {
  const defaultDocuments = guideDocumentsByLocale.get(defaultLocale) ?? [];
  const localeDocumentBySlug = new Map(localeDocuments.map(item => [item.slug, item]));
  const defaultSlugSet = new Set(defaultDocuments.map(item => item.slug));
  return [
    ...defaultDocuments.map(item => localeDocumentBySlug.get(item.slug) ?? item),
    ...localeDocuments.filter(item => !defaultSlugSet.has(item.slug)),
  ].sort((left, right) => {
    if (left.order !== right.order) {
      return left.order - right.order;
    }
    return left.stem.localeCompare(right.stem, 'zh-Hans-CN');
  });
}

const defaultGuideCollection = buildGuideCollection(guideDocumentsByLocale.get(defaultLocale) ?? []);
const guideCollectionsByLocale = new Map<Locale, GuideCollection>([[defaultLocale, defaultGuideCollection]]);

for (const [locale, localeDocuments] of guideDocumentsByLocale) {
  if (locale === defaultLocale) {
    continue;
  }
  guideCollectionsByLocale.set(locale, buildGuideCollection(mergeGuideDocumentsWithDefault(localeDocuments)));
}

export const renderedGuideArticles = defaultGuideCollection.renderedGuideArticles;
export const guideArticles = defaultGuideCollection.guideArticles;
export const defaultGuideArticle = defaultGuideCollection.defaultGuideArticle;
export const guideNavItems = defaultGuideCollection.guideNavItems;

export function getGuideCollection(locale: Locale) {
  return guideCollectionsByLocale.get(locale) ?? defaultGuideCollection;
}

export function findGuideArticle(slug: string, locale: Locale = defaultLocale) {
  const localeCollection = getGuideCollection(locale);
  return localeCollection.renderedGuideArticles.find(item => item.slug === slug)
    ?? defaultGuideCollection.renderedGuideArticles.find(item => item.slug === slug)
    ?? null;
}

export function getGuideStaticPaths() {
  return supportedLocales.flatMap(locale =>
    getGuideCollection(locale).renderedGuideArticles.map(article => ({
      params: locale === defaultLocale ? { slug: article.slug } : { locale, slug: article.slug },
      props: { locale, slug: article.slug },
    })),
  );
}
