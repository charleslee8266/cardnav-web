import assert from 'node:assert/strict';
import test from 'node:test';
import { renderModelFamilyList } from '../src/models/family-list.js';

test('family overflow keeps the stored order and includes every remaining family in its tooltip', () => {
  const names = ['GPT', 'Claude', 'Gemini', 'Grok', 'DeepSeek', 'Qwen', 'Kimi', 'GLM', 'Doubao', 'MiniMax', 'Llama', 'Gemma'];
  const html = renderModelFamilyList(names, '支持模型');
  const [visible, overflow] = html.split('<template data-tip-content>');
  assert.equal((visible.match(/class="data-provider"/g) || []).length, 10);
  assert.match(visible, />\+2<template|>\+2$/);
  assert.ok(visible.indexOf('GPT</span>') < visible.indexOf('Claude</span>'));
  assert.ok(overflow.indexOf('Llama</span>') < overflow.indexOf('Gemma</span>'));
  assert.match(overflow, /<img /);
  assert.doesNotMatch(renderModelFamilyList(names.slice(0, 10), '支持模型'), /data-tip-content/);
});
test('family names and accessible labels remain text in the shared HTML renderer', () => {
  const html = renderModelFamilyList(Array(11).fill('<img onerror="alert(1)">'), '" onclick="alert(1)');
  assert.doesNotMatch(html, /<img onerror|aria-label="" onclick/);
  assert.match(html, /&lt;img onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html, /aria-label="&quot; onclick=&quot;/);
});

test('family selection retains its owning table in visible labels and tooltip copies', () => {
  const html = renderModelFamilyList(Array.from({ length: 11 }, (_, index) => `Family ${index}`), 'Models', 'gateway-sites');
  assert.equal((html.match(/data-family-scope="gateway-sites"/g) || []).length, 11);
  assert.match(html, /data-select-family="family-10"/);
  assert.match(html, /type="button" class="data-provider model-family-select"/);
});
