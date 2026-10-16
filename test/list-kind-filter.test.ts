import assert from 'node:assert/strict';
import test from 'node:test';
import { LIST_KINDS, matchesListKinds } from '../src/list-kind-filter.js';

test('status choices use a union, including merchants with several statuses', () => {
  for (const sponsor of [false, true]) for (const supportPoints of [0, 5]) for (const favorite of [false, true]) {
    const state = { sponsor, supportPoints, favorite };
    assert.equal(matchesListKinds([], state), true);
    for (let mask = 1; mask < 16; mask++) {
      const selected = LIST_KINDS.filter((_, index) => mask & (1 << index));
      const expected = (selected.includes('partner') && sponsor)
        || (selected.includes('support') && supportPoints > 0)
        || (selected.includes('favorite') && favorite)
        || (selected.includes('other') && !sponsor && !supportPoints && !favorite);
      assert.equal(matchesListKinds(selected, state), expected);
    }
  }
});
