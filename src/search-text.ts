/** 索引使用可见纯文本，避免把 Markdown 标记和 HTML 属性作为命中。 */
import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';
const renderer = new MarkdownIt({html: false});
export function searchTextFromHtml(html: string) {
  const separated = html.replace(/<\/(?:p|h[1-6]|li|div|section|blockquote|pre|tr)>/gi, '$& ');
  return renderer.utils.unescapeAll(sanitizeHtml(separated, {allowedTags: [], allowedAttributes: {}})).replace(/\s+/gu, ' ').trim();
}
export function searchTextFromMarkdown(markdown: string) {
  return searchTextFromHtml(renderer.render(markdown));
}
