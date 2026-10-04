import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesLeaderboardHighlight, leaderboardHighlightPath } from '../src/models/leaderboard-highlight.js';

const rows = [
  { modelName: 'claude-opus-high', modelFamily: 'Claude', modelOrganization: 'Anthropic', rank: 1 },
  { modelName: 'gpt-6-max', modelFamily: 'GPT', modelOrganization: 'OpenAI', rank: 2 },
  { modelName: 'gemini-pro', modelFamily: 'Gemini', modelOrganization: 'Google', rank: 3 },
  { modelName: 'kimi-k2', modelFamily: 'Kimi', modelOrganization: 'Moonshot', rank: 4 },
];

test('leaderboard highlights the union of families, providers and keyword without removing rows', () => {
  const highlight = (family: string[], query = '', providers: string[] = []) => rows.map(row => matchesLeaderboardHighlight(row, family, query, providers));
  assert.deepEqual(highlight([]), [false, false, false, false]);
  assert.deepEqual(highlight([], '  '), [false, false, false, false]);
  assert.deepEqual(highlight(['claude', 'gpt']), [true, true, false, false]);
  assert.deepEqual(highlight([], '', ['anthropic', 'openai']), [true, true, false, false]);
  assert.deepEqual(highlight([], 'PRO'), [false, false, true, false]);
  assert.deepEqual(highlight(['claude'], '', ['openai']), [true, true, false, false]);
  assert.deepEqual(highlight(['claude'], 'PRO', ['openai']), [true, true, true, false]);
  assert.deepEqual(highlight(['claude'], 'missing', ['missing']), [true, false, false, false]);
  assert.deepEqual(highlight(['missing'], 'missing', ['missing']), [false, false, false, false]);
  assert.deepEqual(rows.map(row => row.rank), [1, 2, 3, 4]);
});

test('highlight URLs retain every selected value and the search keyword', () => {
  assert.equal(leaderboardHighlightPath('/model-leaderboard/math', 'claude', 'opus high'), '/model-leaderboard/math?family=claude&q=opus+high');
  assert.equal(leaderboardHighlightPath('/model-leaderboard', ['claude'], 'opus', ['anthropic', 'openai']), '/model-leaderboard?family=claude&provider=anthropic&provider=openai&q=opus');
});
