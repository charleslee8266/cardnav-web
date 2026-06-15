/**
 * 文件说明: 在构建期扫描 public-web/guide 下的 Markdown 文档，生成知识库列表、详情内容和站内跳转链接。
 * 对应文档: public-web/guide
 */
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';

const cardnavSiteOrigin = 'https://cardnav.xyz';

export type CardSection = {
  title: string;
  badge?: string;
  icon?: string;
  risk?: string;
  fitFor?: string;
  notFitFor?: string;
  html: string;
};

export type KnowledgeArticle = {
  slug: string;
  title: string;
  description: string;
  sourcePath: string;
  order: number;
  parentLink: GuideParentLink | null;
  nextLink: GuideLinkRef | null;
  guidePresentation: GuidePresentation | null;
  presentation: 'document' | 'cards';
};

export type RenderedKnowledgeArticle = KnowledgeArticle & {
  markdown: string;
  html: string;
  introHtml?: string;
  cards?: CardSection[];
};

export type KnowledgeNavItem = {
  article: KnowledgeArticle;
  depth: number;
};

export type GuideCard = {
  title: string;
  slug: string;
  badge: string;
  summary: string;
  fitFor: string;
  notFitFor: string;
  risk: string;
  example?: string;
  exampleLang?: string;
};

export type GuidePresentation = {
  kind: 'card-grid';
  eyebrow: string;
  intro: string;
  cards: GuideCard[];
  showArticleBody?: boolean;
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

const rawKnowledgeMarkdownModules = import.meta.glob('../guide/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

type FrontmatterGuideCard = {
  title?: unknown;
  slug?: unknown;
  badge?: unknown;
  summary?: unknown;
  fitFor?: unknown;
  notFitFor?: unknown;
  risk?: unknown;
  example?: unknown;
  exampleLang?: unknown;
};

type FrontmatterGuidePresentation = {
  kind?: unknown;
  eyebrow?: unknown;
  intro?: unknown;
  cards?: unknown;
  showArticleBody?: unknown;
};

type FrontmatterData = {
  title?: unknown;
  description?: unknown;
  parent?: unknown;
  next?: unknown;
  guidePresentation?: FrontmatterGuidePresentation | null;
  presentation?: unknown;
};

type ParsedKnowledgeDocument = {
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
  guidePresentation: GuidePresentation | null;
  presentation: 'document' | 'cards';
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

function parseGuideCard(value: unknown): GuideCard | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const rawCard = value as FrontmatterGuideCard;
  const title = asNonEmptyString(rawCard.title);
  const slug = asNonEmptyString(rawCard.slug);
  const badge = asNonEmptyString(rawCard.badge);
  const summary = asNonEmptyString(rawCard.summary);
  const fitFor = asNonEmptyString(rawCard.fitFor);
  const notFitFor = asNonEmptyString(rawCard.notFitFor);
  const risk = asNonEmptyString(rawCard.risk);
  const example = asNonEmptyString(rawCard.example) ?? undefined;
  const exampleLang = asNonEmptyString(rawCard.exampleLang) ?? undefined;
  if (!title || !slug || !badge || !summary || !fitFor || !notFitFor || !risk) {
    return null;
  }
  return {
    title,
    slug,
    badge,
    summary,
    fitFor,
    notFitFor,
    risk,
    example,
    exampleLang,
  };
}

function parseGuidePresentation(value: unknown): GuidePresentation | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const rawPresentation = value as FrontmatterGuidePresentation;
  if (rawPresentation.kind !== 'card-grid') {
    return null;
  }
  const eyebrow = asNonEmptyString(rawPresentation.eyebrow);
  const intro = asNonEmptyString(rawPresentation.intro);
  const cards = Array.isArray(rawPresentation.cards)
    ? rawPresentation.cards
      .map(parseGuideCard)
      .filter((card): card is GuideCard => card !== null)
    : [];
  if (!eyebrow || !intro || cards.length === 0) {
    return null;
  }
  return {
    kind: 'card-grid',
    eyebrow,
    intro,
    cards,
    showArticleBody: rawPresentation.showArticleBody === false ? false : true,
  };
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
  documentBySlug: Map<string, ParsedKnowledgeDocument>,
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
  childrenByParentSlug: Map<string | null, ParsedKnowledgeDocument[]>,
  depth: number,
): KnowledgeNavItem[] {
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
        guidePresentation: child.guidePresentation,
        presentation: child.presentation,
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
      return `](/knowledge/${slug}${hash})`;
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

  // Open links that do not target /knowledge or # in a new tab
  processed = processed.replace(/<a\s+([^>]*?)href="([^"]+)"([^>]*?)>/gu, (match, prefix, href, suffix) => {
    if (href.startsWith('/knowledge') || href.startsWith('#')) {
      return match;
    }
    if (prefix.includes('target=') || suffix.includes('target=')) {
      return match;
    }
    return `<a ${prefix}href="${href}"${suffix} target="_blank" rel="noopener noreferrer">`;
  });

  return processed;
}

function parseCardsFromMarkdown(
  markdown: string,
  slugByFileName: Map<string, string>
): { introHtml: string; cards: CardSection[] } {
  const lines = markdown.split(/\r?\n/u);
  const cards: CardSection[] = [];
  let introLines: string[] = [];
  let currentCardTitle = '';
  let currentCardMetadata: { badge?: string; icon?: string } = {};
  let currentCardLines: string[] = [];
  let inCard = false;

  const pushCurrentCard = () => {
    let firstNonEmptyIndex = -1;
    for (let i = 0; i < currentCardLines.length; i++) {
      if (currentCardLines[i].trim() !== '') {
        if (currentCardLines[i].trim().startsWith('<!--') && currentCardLines[i].trim().endsWith('-->')) {
          firstNonEmptyIndex = i;
        }
        break;
      }
    }

    const metadata: { badge?: string; icon?: string; risk?: string; fitFor?: string; notFitFor?: string } = { ...currentCardMetadata };
    if (firstNonEmptyIndex !== -1) {
      const commentContent = currentCardLines[firstNonEmptyIndex].trim().replace(/^<!--\s*/u, '').replace(/\s*-->$/u, '');
      const attrRegex = /([a-zA-Z0-9_-]+)="([^"]*)"/gu;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(commentContent)) !== null) {
        if (attrMatch[1] === 'badge') metadata.badge = attrMatch[2];
        if (attrMatch[1] === 'icon') metadata.icon = attrMatch[2];
        if (attrMatch[1] === 'risk') metadata.risk = attrMatch[2];
        if (attrMatch[1] === 'fitFor') metadata.fitFor = attrMatch[2];
        if (attrMatch[1] === 'notFitFor') metadata.notFitFor = attrMatch[2];
      }
      currentCardLines.splice(firstNonEmptyIndex, 1);
    }

    cards.push({
      title: currentCardTitle,
      badge: metadata.badge,
      icon: metadata.icon,
      risk: metadata.risk,
      fitFor: metadata.fitFor,
      notFitFor: metadata.notFitFor,
      html: rewriteRenderedHtmlLinks(markdownRenderer.render(rewriteMarkdownLinks(currentCardLines.join('\n'), slugByFileName))),
    });
  };

  for (const line of lines) {
    if (line.trim().startsWith('## ')) {
      if (inCard) {
        pushCurrentCard();
        currentCardLines = [];
      } else {
        inCard = true;
      }
      
      const h2Content = line.replace(/^\s*##\s+/u, '').trim();
      const commentMatch = h2Content.match(/<!--\s*([\s\S]*?)\s*-->/u);
      let cleanTitle = h2Content;
      const metadata: { badge?: string; icon?: string } = {};
      
      if (commentMatch) {
        cleanTitle = h2Content.replace(/<!--\s*[\s\S]*?\s*-->/gu, '').trim();
        const commentContent = commentMatch[1];
        const attrRegex = /([a-zA-Z0-9_-]+)="([^"]*)"/gu;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(commentContent)) !== null) {
          if (attrMatch[1] === 'badge') metadata.badge = attrMatch[2];
          if (attrMatch[1] === 'icon') metadata.icon = attrMatch[2];
        }
      }
      
      currentCardTitle = cleanTitle;
      currentCardMetadata = metadata;
    } else {
      if (inCard) {
        currentCardLines.push(line);
      } else {
        if (!line.trim().startsWith('# ')) {
          introLines.push(line);
        }
      }
    }
  }

  if (inCard) {
    pushCurrentCard();
  }

  const introHtml = rewriteRenderedHtmlLinks(markdownRenderer.render(rewriteMarkdownLinks(introLines.join('\n'), slugByFileName)));
  return { introHtml, cards };
}

const rawKnowledgeDocuments: ParsedKnowledgeDocument[] = Object.entries(rawKnowledgeMarkdownModules)
  .map(([modulePath, rawMarkdown]) => {
    const fileName = fileNameFromModulePath(modulePath);
    const stem = stemFromFileName(fileName);
    const slug = slugFromStem(stem);
    const fallbackTitle = slugFromStem(stem).replace(/-/gu, ' ');
    const { content, data } = matter(rawMarkdown);
    const frontmatter = (data ?? {}) as FrontmatterData;
    const frontmatterTitle = asNonEmptyString(frontmatter.title);
    const frontmatterDescription = asNonEmptyString(frontmatter.description);
    const presentation: 'document' | 'cards' = frontmatter.presentation === 'cards' || frontmatter.presentation === 'wizard' ? 'cards' : 'document';
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
      guidePresentation: parseGuidePresentation(frontmatter.guidePresentation),
      presentation,
    };
  })
  .sort((left, right) => {
    if (left.order !== right.order) {
      return left.order - right.order;
    }
    return left.stem.localeCompare(right.stem, 'zh-Hans-CN');
  });

const slugByFileName = new Map(rawKnowledgeDocuments.map(item => [item.fileName, item.slug]));
const documentBySlug = new Map(rawKnowledgeDocuments.map(item => [item.slug, item]));
const directParentBySlug = new Map(rawKnowledgeDocuments.map(item => [item.slug, item.directParentLink]));

export const renderedKnowledgeArticles: RenderedKnowledgeArticle[] = rawKnowledgeDocuments.map(item => {
  const normalizedMarkdown = rewriteMarkdownLinks(item.markdown, slugByFileName);
  let introHtml: string | undefined = undefined;
  let cards: CardSection[] | undefined = undefined;
  
  if (item.presentation === 'cards') {
    const parsed = parseCardsFromMarkdown(item.markdown, slugByFileName);
    introHtml = parsed.introHtml;
    cards = parsed.cards;
  }

  return {
    slug: item.slug,
    title: item.title,
    description: item.description,
    sourcePath: item.sourcePath,
    order: item.order,
    presentation: item.presentation,
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
    guidePresentation: item.guidePresentation,
    markdown: normalizedMarkdown,
    html: rewriteRenderedHtmlLinks(markdownRenderer.render(normalizedMarkdown)),
    introHtml,
    cards,
  };
});

export const knowledgeArticles: KnowledgeArticle[] = renderedKnowledgeArticles.map(({
  slug,
  title,
  description,
  sourcePath,
  order,
  parentLink,
  nextLink,
  guidePresentation,
  presentation,
}) => ({
  slug,
  title,
  description,
  sourcePath,
  order,
  parentLink,
  nextLink,
  guidePresentation,
  presentation,
}));

export const defaultKnowledgeArticle = renderedKnowledgeArticles[0] ?? null;

const articleBySlug = new Map(knowledgeArticles.map(article => [article.slug, article]));
const childrenByParentSlug = new Map<string | null, ParsedKnowledgeDocument[]>();

for (const item of rawKnowledgeDocuments) {
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

export const knowledgeNavItems: KnowledgeNavItem[] = collectDescendants(null, childrenByParentSlug, 0).map(item => ({
  article: articleBySlug.get(item.article.slug) ?? item.article,
  depth: item.depth,
}));

export function findKnowledgeArticle(slug: string) {
  return renderedKnowledgeArticles.find(item => item.slug === slug) ?? null;
}
