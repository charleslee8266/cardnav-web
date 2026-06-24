/**
 * 文件说明: 验证 Guide Markdown 的三类链接契约，避免站内、站外和 Guide 相对链接规则回退。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  guideLinkTargetAttributes,
  normalizeGuideHref,
  normalizeGuideTargetPage,
  rewriteGuideMarkdownLinks,
  rewriteGuideRenderedHtmlLinks,
  shouldOpenGuideHrefInNewPage,
} from '../src/guide-link-rules.js';

test('rewrites Guide-relative Markdown document links to Guide routes', () => {
  const slugByFileName = new Map([
    ['211-usage-api-gateway.md', 'usage-api-gateway'],
  ]);

  assert.equal(
    rewriteGuideMarkdownLinks('[Details](./211-usage-api-gateway.md#safe)', slugByFileName),
    '[Details](/guide/usage-api-gateway#safe)',
  );
  assert.equal(
    rewriteGuideMarkdownLinks('[Missing](./999-missing.md)', slugByFileName),
    '[Missing](./999-missing.md)',
  );
});

test('normalizes full CardNav URLs to relative hrefs and opens them in a new page', () => {
  const html = rewriteGuideRenderedHtmlLinks('<p><a href="https://cardnav.xyz/llm-gateway?model=gpt#list">More</a></p>');

  assert.equal(
    html,
    '<p><a href="/llm-gateway?model=gpt#list" target="_blank" rel="noopener noreferrer">More</a></p>',
  );
  assert.equal(normalizeGuideHref('https://cardnav.xyz/llm-gateway'), '/llm-gateway');
  assert.equal(normalizeGuideTargetPage('https://cardnav.xyz/llm-gateway', '/guide/usage-api-gateway'), '/llm-gateway');
  assert.equal(shouldOpenGuideHrefInNewPage('https://cardnav.xyz/llm-gateway'), true);
  assert.equal(guideLinkTargetAttributes('https://cardnav.xyz/llm-gateway'), ' target="_blank" rel="noopener noreferrer"');
});

test('keeps full external URLs and opens them in a new page', () => {
  const html = rewriteGuideRenderedHtmlLinks('<p><a href="https://example.com/path">External</a></p>');

  assert.equal(
    html,
    '<p><a href="https://example.com/path" target="_blank" rel="noopener noreferrer">External</a></p>',
  );
  assert.equal(normalizeGuideHref('https://example.com/path'), 'https://example.com/path');
  assert.equal(normalizeGuideTargetPage('https://example.com/path', '/guide/usage-api-gateway'), 'https://example.com/path');
});

test('keeps absolute paths and anchors in the current page', () => {
  assert.equal(rewriteGuideRenderedHtmlLinks('<p><a href="/guide/start">Start</a></p>'), '<p><a href="/guide/start">Start</a></p>');
  assert.equal(rewriteGuideRenderedHtmlLinks('<p><a href="#risk">Risk</a></p>'), '<p><a href="#risk">Risk</a></p>');
  assert.equal(normalizeGuideTargetPage('#risk', '/guide/usage-api-gateway'), '/guide/usage-api-gateway#risk');
  assert.equal(shouldOpenGuideHrefInNewPage('/guide/start'), false);
  assert.equal(shouldOpenGuideHrefInNewPage('#risk'), false);
});
