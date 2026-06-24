/**
 * 文件说明: 维护 Guide Markdown 链接到网页链接的转换规则，供渲染逻辑和测试复用。
 */
export const cardnavSiteOrigin = 'https://cardnav.xyz';

export function rewriteGuideMarkdownLinks(markdown: string, slugByFileName: Map<string, string>) {
  return markdown.replace(/\]\((\.\/[^)#]+\.md)(#[^)]+)?\)/gu, (_match, relativePath: string, hash = '') => {
    const fileName = relativePath.replace('./', '');
    const slug = slugByFileName.get(fileName);
    if (!slug) {
      return `](${relativePath}${hash})`;
    }
    return `](/guide/${slug}${hash})`;
  });
}

export function normalizeGuideHref(href: string) {
  if (href.startsWith('#')) {
    return href;
  }
  try {
    const url = new URL(href, cardnavSiteOrigin);
    if (url.origin === cardnavSiteOrigin) {
      return `${url.pathname}${url.search}${url.hash}` || '/';
    }
    return href;
  } catch {
    return href;
  }
}

export function shouldOpenGuideHrefInNewPage(href: string) {
  if (!/^https?:\/\//iu.test(href)) {
    return false;
  }
  try {
    const url = new URL(href, cardnavSiteOrigin);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function guideLinkTargetAttributes(href: string) {
  return shouldOpenGuideHrefInNewPage(href) ? ' target="_blank" rel="noopener noreferrer"' : '';
}

export function normalizeGuideTargetPage(href: string, sourcePage: string) {
  if (href.startsWith('#')) {
    return `${sourcePage}${href}`;
  }

  return normalizeGuideHref(href);
}

export function rewriteGuideRenderedHtmlLinks(html: string) {
  return html.replace(/<a\s+([^>]*?)href="([^"]+)"([^>]*?)>/gu, (match, prefix, href, suffix) => {
    const normalizedHref = normalizeGuideHref(href);
    const rewrittenMatch = normalizedHref === href
      ? match
      : `<a ${prefix}href="${normalizedHref}"${suffix}>`;

    if (!shouldOpenGuideHrefInNewPage(href)) {
      return rewrittenMatch;
    }
    if (prefix.includes('target=') || suffix.includes('target=')) {
      return rewrittenMatch;
    }
    return rewrittenMatch.replace(/>$/u, `${guideLinkTargetAttributes(href)}>`);
  });
}
