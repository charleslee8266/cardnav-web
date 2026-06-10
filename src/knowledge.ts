/**
 * 文件说明: 维护公开知识库文章真源，并在请求文章页时把 Markdown 文档渲染成 HTML。
 * 对应文档: public-web/docs/how-to-choose-reliable-merchant.md
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type KnowledgeArticle = {
  slug: string;
  title: string;
  description: string;
  path: string;
  datePublished: string;
  dateModified: string;
};

export type RenderedKnowledgeArticle = KnowledgeArticle & {
  markdown: string;
  html: string;
};

const sourceRootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsRootDir = path.join(sourceRootDir, 'docs');

export const knowledgeArticles: KnowledgeArticle[] = [
  {
    slug: 'how-to-choose-reliable-merchant',
    title: '怎么判断一个商家靠不靠谱',
    description: '购买 AI 账号和虚拟商品前，可以从商品数量、热门需求、支付方式、联系方式、社群活跃度和库存更新等角度判断商家是否更值得信任。',
    path: 'how-to-choose-reliable-merchant.md',
    datePublished: '2026-06-10',
    dateModified: '2026-06-10',
  },
];

function escapeHtml(input: string) {
  return input.replace(/[&<>"']/g, character => {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[character] ?? character;
  });
}

function renderInlineMarkdown(input: string) {
  return escapeHtml(input)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
}

export function renderMarkdown(markdown: string) {
  const blocks: string[] = [];
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let paragraphLines: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }
    blocks.push(`<p>${renderInlineMarkdown(paragraphLines.join(' '))}</p>`);
    paragraphLines = [];
  };

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }
    blocks.push(`<ul>${listItems.map(item => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</ul>`);
    listItems = [];
  };

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(trimmedLine);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      blocks.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    const listMatch = /^-\s+(.+)$/.exec(trimmedLine);
    if (listMatch) {
      flushParagraph();
      listItems.push(listMatch[1]);
      continue;
    }

    flushList();
    paragraphLines.push(trimmedLine);
  }

  flushParagraph();
  flushList();

  return blocks.join('\n');
}

export function getKnowledgeArticle(slug: string): RenderedKnowledgeArticle | null {
  const article = knowledgeArticles.find(item => item.slug === slug);
  if (!article) {
    return null;
  }
  const markdown = readFileSync(path.join(docsRootDir, article.path), 'utf8');
  return {
    ...article,
    markdown,
    html: renderMarkdown(markdown),
  };
}
