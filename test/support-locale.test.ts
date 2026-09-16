/**
 * 文件说明: 验证赞赏创建在读取表单前失败时仍返回当前语言，并隐藏内部异常。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { APIContext } from 'astro';
import { GET as listSites } from '../src/pages/api/support/sites.js';
import { GET as orderStatus } from '../src/pages/api/support/status.js';
import { POST } from '../src/pages/api/support/index.js';
import { failure } from '../src/support/http.js';
import { getMessages } from '../src/i18n/messages.js';

test('checkout errors use the requested language even before form parsing', async () => {
  const previous = process.env.EASYPAY_PID;
  delete process.env.EASYPAY_PID;
  try {
    for (const locale of ['zh', 'en', 'ru'] as const) {
      const request = new Request('https://cardnav.example.test/api/support', {
        method: 'POST', headers: { 'x-cardnav-locale': locale },
      });
      const response = await POST({ request, clientAddress: '127.0.0.1' } as APIContext);
      assert.equal(response.status, 503);
      assert.equal((await response.json()).message, getMessages(locale).supportErrors.paymentUnavailable);
    }
  } finally {
    if (previous === undefined) delete process.env.EASYPAY_PID;
    else process.env.EASYPAY_PID = previous;
  }
});

test('unexpected failures hide internal details and invalid locales use Chinese', async () => {
  for (const locale of ['en', 'ru'] as const) {
    const response = failure(new Error('private database detail'), locale);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, message: getMessages(locale).supportErrors.unavailable });
  }
  assert.equal((await failure(new Error(), 'invalid').json()).message, getMessages('zh').supportErrors.unavailable);
});

test('support query errors preserve the requested language', async () => {
  for (const locale of ['zh', 'en', 'ru'] as const) {
    for (const [handler, path] of [[listSites, 'sites?kind=shop&kind=gateway'], [orderStatus, 'status?token=a&token=b']] as const) {
      const request = new Request(`https://cardnav.example.test/api/support/${path}`, {
        headers: { 'x-cardnav-locale': locale },
      });
      const response = await handler({ request, url: new URL(request.url) } as APIContext);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).message, getMessages(locale).supportErrors.invalidParameters);
    }
  }
});
