import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesAllSelections } from '../src/models/gateway-selection.js';

test('gateway selections require every selected model and payment without excluding unselected extras', () => {
  assert.equal(matchesAllSelections([], []), true);
  assert.equal(matchesAllSelections(['gpt', 'claude'], ['gpt']), false);
  assert.equal(matchesAllSelections(['gpt', 'claude'], ['gemini', 'claude', 'gpt']), true);
  assert.equal(matchesAllSelections(['alipay', 'wechat'], ['alipay']), false);
  assert.equal(matchesAllSelections(['alipay', 'wechat'], ['wechat', 'paypal', 'alipay']), true);
  assert.equal(matchesAllSelections(['seventh'], ['1', '2', '3', '4', '5', '6', 'seventh']), true);
});
