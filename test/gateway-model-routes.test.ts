import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gatewayModelPath, gatewayModelIdFromPathname } from '../src/models/routes.js';

test('model URLs preserve provider slashes, literal escapes and Unicode through page and API routes', () => {
  for (const id of ['gpt-5.4', 'openai/gpt-6.1-sol', 'vendor/model%2Fvariant', '模型/中文 100%', 'vendor/model?#tag']) {
    for (const prefix of ['/llm-gateway/models', '/en/llm-gateway/models']) {
      const pathname = new URL(gatewayModelPath(id, prefix), 'https://example.test').pathname;
      assert.equal(gatewayModelIdFromPathname(pathname), id);
      assert.equal(gatewayModelIdFromPathname(pathname + '/'), id);
    }
    const api = new URL(gatewayModelPath(id, '/api/llm-gateway/model-sites') + '.json', 'https://example.test');
    assert.equal(gatewayModelIdFromPathname(api.pathname, '.json'), id);
  }
});

test('malformed encoding or API suffix is rejected without guessing a different model', () => {
  assert.equal(gatewayModelIdFromPathname('/llm-gateway/models/bad%escape'), null);
  assert.equal(gatewayModelIdFromPathname('/api/llm-gateway/model-sites/model', '.json'), null);
});
