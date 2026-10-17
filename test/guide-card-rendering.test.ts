import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

test('指南卡片保留正文与行动链接，避免嵌套链接破坏浏览器布局', async () => {
  const server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    configFile: false,
    server: { middlewareMode: true },
    appType: 'custom',
  });
  try {
    const { renderedGuideArticles } = await server.ssrLoadModule('/src/guide.ts');
    for (const article of renderedGuideArticles) {
      let linkDepth = 0;
      for (const token of article.html.matchAll(/<\/?a(?:\s[^>]*|)>/g)) {
        linkDepth += token[0].startsWith('</') ? -1 : 1;
        assert.ok(linkDepth >= 0 && linkDepth <= 1, `${article.slug} 存在嵌套或不匹配的链接`);
      }
      assert.equal(linkDepth, 0);
    }
    const models = renderedGuideArticles.find((article: { slug: string }) => article.slug === 'choose-model');
    assert.match(models.html, /href="(?:https:\/\/cardnav.xyz)?\/model-leaderboard"/);
    assert.match(models.html, /<article class="guide-card">/);
    const usage = renderedGuideArticles.find((article: { slug: string }) => article.slug === 'choose-usage-method');
    assert.match(usage.html, /<a[^>]*href="\/guide\/usage-api-gateway"[^>]*>/);
    const start = renderedGuideArticles.find((article: { slug: string }) => article.slug === 'start-here');
    assert.match(start.html, /<a class="guide-card guide-card-clickable"[^>]*href="\/guide\/choose-model"/);
  } finally {
    await server.close();
  }
});
