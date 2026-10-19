import assert from 'node:assert/strict';
import test from 'node:test';
import type pg from 'pg';
import { loadGatewaySites } from '../src/store.js';

test('CodeKey public rows show Sub2API while other custom panels keep their existing label', async () => {
  const queryClient = {
    async query(sql: string) {
      return { rows: sql.includes('WITH ranked_sites')
        ? ['custom-codekey', 'sub2Api', 'custom-coreapi'].map((family, i) => ({ id: String(i), site_name: 'Gateway', url: 'https://example.test', family }))
        : [{ total_site_count: 3 }] };
    },
  } as unknown as pg.PoolClient;
  const { sites } = await loadGatewaySites({ queryClient });
  assert.deepEqual(sites.map(site => site.displayFamily), ['Sub2API', 'Sub2API', '']);
});
