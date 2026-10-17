import assert from 'node:assert/strict';
import test from 'node:test';

// Run against a local server and an existing published article; never creates content.
const base = process.env.GUIDE_TEST_BASE_URL;
const slug = process.env.GUIDE_TEST_ARTICLE_SLUG;
test('文章栏目、目录和详情保留界面语言，SEO 仍指向中文原文', {skip: !base || !slug}, async () => {
  for (const locale of ['en','ru']) {
    const path = `/${locale}/guide/${slug}`;
    for (const route of [`/${locale}/guide`, `/${locale}/guide/articles`, path]) {
      const response = await fetch(new URL(route, base), {redirect:'manual'});
      assert.equal(response.status,200,route);
      const html = await response.text();
      assert.match(html,new RegExp(`<html[^>]+lang="${locale}"`));
      assert.ok(html.includes(`href="/${locale}/guide/articles"`),`${route}: article section loses locale`);
      assert.ok(html.includes(`href="${path}"`),`${route}: article directory loses locale`);
      if (route === path) {
        assert.match(html, /<link[^>]+rel="canonical"[^>]+href="https?:\/\/[^/]+\/guide\/[^"/]+"/);
        assert.doesNotMatch(html, /<link[^>]+hreflang=/);
        assert.match(html, /id="guide-article"[^>]+lang="zh-CN"/);
        const graph = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
          .flatMap(match => JSON.parse(match[1])['@graph'] ?? []);
        assert.equal(graph.find(node => node['@type'] === 'Article')?.inLanguage,'zh-CN');
      }
    }
  }
});
