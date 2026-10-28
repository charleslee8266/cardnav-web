/**
 * 文件说明: 验证公开提交来源、重复提交的状态恢复、历史保留与并发封禁边界。
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { submitGatewaySite, submitSiteUrl } from '../src/store.js';

test('public resubmission requeues eligible sites without changing protected states or merchant data', {
  skip: !process.env.CARDNAV_TEST_DATABASE_URL,
}, async context => {
  const connectionString = process.env.CARDNAV_TEST_DATABASE_URL;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = connectionString;
  context.after(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });
  const db = new pg.Client({ connectionString });
  const moderator = new pg.Client({ connectionString });
  const schema = `resubmit_${randomUUID().replaceAll('-', '')}`;
  await db.connect();
  await moderator.connect();
  try {
    await db.query(`CREATE SCHEMA ${schema}`);
    await db.query(`SET search_path TO ${schema}`);
    await moderator.query(`SET search_path TO ${schema}`);
    await db.query(`CREATE TABLE shop_sites (
      id text PRIMARY KEY, url text UNIQUE, status text, name text, family text, type text,
      submission_source text NOT NULL DEFAULT 'unknown',
      ingest_retry_count integer DEFAULT 0, last_ingest_complete_at timestamptz,
      last_ingest_success_at timestamptz, last_ingest_error_type text, last_ingest_error_message text,
      updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE gateway_sites (
      url text PRIMARY KEY, api_endpoint text, status text, site_id text, name text, family text, type text,
      slug text, host text, weight numeric, summary text, payment_methods text[], invite_url text,
      retry_count integer DEFAULT 0, last_ingest_complete_at timestamptz,
      last_ingest_success_at timestamptz, last_error_type text, last_error_message text,
      updated_at timestamptz DEFAULT now()
    )`);
    context.mock.method(pg.Pool.prototype, 'query', (sql: string, values?: unknown[]) => db.query(sql, values));

    for (const kind of ['shop', 'gateway'] as const) {
      const table = kind === 'shop' ? 'shop_sites' : 'gateway_sites';
      const retry = kind === 'shop' ? 'ingest_retry_count' : 'retry_count';
      const errorType = kind === 'shop' ? 'last_ingest_error_type' : 'last_error_type';
      const errorMessage = kind === 'shop' ? 'last_ingest_error_message' : 'last_error_message';
      const submit = (url: string) => kind === 'shop' ? submitSiteUrl(url)
        : submitGatewaySite({ url, name: 'Replacement name', summary: 'Replacement summary', paymentMethods: ['visa'] });
      const freshUrl = `https://new-${kind}.merchant.shop`;
      assert.deepEqual(await submit(freshUrl), { ok: true, url: freshUrl });
      assert.equal((await db.query(`SELECT status FROM ${table} WHERE url=$1`, [freshUrl])).rows[0].status, 'accepted');
      if (kind === 'shop') {
        assert.equal((await db.query('SELECT submission_source FROM shop_sites WHERE url=$1', [freshUrl])).rows[0].submission_source, 'webpage');
      }

      for (const status of ['deferred', 'needs_review', 'invalid', 'unsupported', 'offline', 'banned', 'online', 'accepted', 'future-status']) {
        const url = `https://${kind}-${status.replaceAll('_', '-')}.merchant.shop`;
        await submit(url);
        if (kind === 'shop') await db.query("UPDATE shop_sites SET submission_source='batch' WHERE url=$1", [url]);
        await db.query(`UPDATE ${table} SET status=$2,name='Original name',family='original-family',type='original-type',
          ${retry}=3,last_ingest_complete_at='2026-01-02',last_ingest_success_at='2026-01-01',
          ${errorType}='original-error',${errorMessage}='Original failure',updated_at='2026-01-03' WHERE url=$1`, [url, status]);
        if (kind === 'gateway') await db.query(`UPDATE gateway_sites SET invite_url='https://merchant.shop/invite',summary='Original summary' WHERE url=$1`, [url]);
        const before = (await db.query(`SELECT * FROM ${table} WHERE url=$1`, [url])).rows[0];
        const result = await submit(url);
        const after = (await db.query(`SELECT * FROM ${table} WHERE url=$1`, [url])).rows[0];
        const eligible = ['deferred', 'needs_review', 'invalid', 'unsupported', 'offline'].includes(status);
        if (eligible) {
          assert.deepEqual(result, { ok: true, url }, `${kind}/${status}`);
          assert.equal(after.status, 'accepted');
          assert.equal(after[retry], 0);
          assert.equal(after.last_ingest_complete_at, null);
          assert.equal(after[errorType], null);
          assert.equal(after[errorMessage], null);
          for (const column of Object.keys(before).filter(key => !['status', retry, 'last_ingest_complete_at', errorType, errorMessage, 'updated_at'].includes(key))) {
            assert.deepEqual(after[column], before[column], `${kind}/${status}/${column}`);
          }
        } else {
          assert.deepEqual(result, { ok: false, errorKey: 'duplicateUrl' }, `${kind}/${status}`);
          assert.deepEqual(after, before, `${kind}/${status} is preserved`);
        }
      }

      const bannedUrl = `https://${kind}-concurrent.merchant.shop`;
      await submit(bannedUrl);
      await db.query(`UPDATE ${table} SET status='offline' WHERE url=$1`, [bannedUrl]);
      await moderator.query('BEGIN');
      await moderator.query(`UPDATE ${table} SET status='banned' WHERE url=$1`, [bannedUrl]);
      const pid = (await db.query('SELECT pg_backend_pid() pid')).rows[0].pid;
      let settled = false;
      let blockedByBan = false;
      const resubmission = submit(bannedUrl).finally(() => { settled = true; });
      // Wait until the real upsert is blocked by the moderator's row lock.
      // pg sends queries in order, so inspect the waiting connection from the moderator.
      for (let attempt = 0; attempt < 100 && !settled; attempt += 1) {
        const waiting = await moderator.query(`SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1`, [pid]);
        if (waiting.rows[0]?.wait_event_type === 'Lock') {
          blockedByBan = true;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      await moderator.query('COMMIT');
      assert.equal(blockedByBan, true, `${kind} resubmission waits for the concurrent ban`);
      assert.deepEqual(await resubmission, { ok: false, errorKey: 'duplicateUrl' });
      assert.equal((await db.query(`SELECT status FROM ${table} WHERE url=$1`, [bannedUrl])).rows[0].status, 'banned');
    }
  } finally {
    await moderator.query('ROLLBACK');
    await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await Promise.all([db.end(), moderator.end()]);
  }
});
