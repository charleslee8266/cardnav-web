import assert from 'node:assert/strict';
import test from 'node:test';
import { relativeUpdateTime, refreshTimestamp, exactRefreshTime } from '../src/refresh-time.js';

test('refresh times use numeric relative days through 72 hours and dates thereafter', () => {
  const now = Date.parse('2026-10-03T04:00:00Z');
  const day = 86400000;
  assert.equal(relativeUpdateTime(now - day, 'zh', now), '1天前');
  assert.equal(relativeUpdateTime(now - 2 * day, 'zh', now), '2天前');
  assert.equal(relativeUpdateTime(now - 3 * day, 'zh', now), '3天前');
  assert.equal(relativeUpdateTime(now - 3 * day - 1, 'zh', now), '09/30');
  assert.equal(relativeUpdateTime(0, 'zh', now), '—');
});

test('refresh display uses minutes and hours, omits current Beijing year, and retains prior years', () => {
  const now = Date.parse('2026-10-03T04:00:00Z');
  assert.equal(relativeUpdateTime(now - 90_000, 'zh', now), '1分钟前');
  assert.equal(relativeUpdateTime(now - 3_600_000, 'zh', now), '1小时前');
  assert.equal(relativeUpdateTime(Date.parse('2025-12-31T04:00:00Z'), 'zh', now), '2025/12/31');
  // The Beijing calendar year is already 2026 at this UTC timestamp.
  const beijingNewYear = Date.parse('2025-12-31T17:00:00Z');
  assert.equal(relativeUpdateTime(beijingNewYear, 'zh', now), '01/01');
  assert.equal(exactRefreshTime(beijingNewYear), '2026/01/01 01:00:00 (UTC+8)');
});

test('refresh inputs accept epoch or timezone-qualified ISO, never ambiguous formatted display dates', () => {
  const iso = '2026-10-03T04:00:00Z';
  assert.equal(refreshTimestamp(iso), Date.parse(iso));
  assert.equal(refreshTimestamp(Date.parse(iso)), Date.parse(iso));
  for (const value of ['03/10/2026', '2026-10-03 12:00:00', '2026-10-03T12:00:00', null, '', NaN]) assert.equal(refreshTimestamp(value), 0);
});
