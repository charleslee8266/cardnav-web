/**
 * 文件说明: 维护公开知识库文章元数据，并用成熟 Markdown 管线渲染构建期读取的正文。
 * 对应文档: public-web/docs/how-to-choose-reliable-merchant.md
 */
import MarkdownIt from 'markdown-it';

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

const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});

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

export function renderMarkdown(markdown: string) {
  return markdownRenderer.render(markdown);
}

export function findKnowledgeArticle(slug: string): KnowledgeArticle | null {
  return knowledgeArticles.find(item => item.slug === slug) ?? null;
}

export function renderKnowledgeArticle(article: KnowledgeArticle, markdown: string): RenderedKnowledgeArticle {
  return {
    ...article,
    markdown,
    html: renderMarkdown(markdown),
  };
}

export function getKnowledgeArticleFromMarkdown(slug: string, markdown: string): RenderedKnowledgeArticle | null {
  const article = findKnowledgeArticle(slug);
  if (!article) {
    return null;
  }
  return renderKnowledgeArticle(article, markdown);
}
