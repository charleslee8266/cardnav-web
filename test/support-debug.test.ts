/**
 * 文件说明: 验证模拟支付只能由服务端环境变量在本地开发环境启用。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { SupportDebugPayment } from '../src/support/SupportDebugPayment.js';

test('debug payments require an explicit flag, development mode and local request/database hosts', () => {
  const original = { ...process.env };
  try {
    process.env.SUPPORT_PAYMENT_DEBUG = 'false';
    assert.equal(SupportDebugPayment.fromEnv('http://localhost:3100/api/support'), undefined);
    Object.assign(process.env, { SUPPORT_PAYMENT_DEBUG: 'true', NODE_ENV: 'development', DATABASE_URL: 'postgres://localhost/cardnav' });
    assert.equal(SupportDebugPayment.fromEnv('http://localhost:3100/api/support')?.origin, 'http://localhost:3100');
    assert.throws(() => SupportDebugPayment.fromEnv('https://cardnav.xyz/api/support'));
    process.env.DATABASE_URL = 'postgres://remote.example/cardnav';
    assert.throws(() => SupportDebugPayment.fromEnv('http://localhost:3100/api/support'));
    process.env.DATABASE_URL = 'postgres://localhost/cardnav';
    for (const mode of ['production', 'test', '']) {
      process.env.NODE_ENV = mode;
      assert.throws(() => SupportDebugPayment.fromEnv('http://localhost:3100/api/support'));
    }
  } finally {
    for (const key of ['SUPPORT_PAYMENT_DEBUG', 'NODE_ENV', 'DATABASE_URL']) {
      if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key];
    }
  }
});
