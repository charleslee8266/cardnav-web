/*
文件说明: 验证商家平台识别及自建站外链统一风险提醒规则。
*/
import assert from 'node:assert/strict';
import test from 'node:test';
import { shopPlatformName, shopPlatformFromUrl, requiresProductRiskConfirmation } from '../src/shop-platform.js';

test('hosting identities use the public brand and keep self-hosted sites outside hosted platforms', () => {
  assert.equal(shopPlatformName('platform-catfk'), '云猫寄售');
  assert.equal(shopPlatformName('platform-wzyp'), '链动小铺');
  assert.equal(shopPlatformName('platform-16688'), '16688');
  assert.equal(shopPlatformName('unknown'), '');
  assert.equal(shopPlatformName('dujiaoka'), '');
  assert.equal(shopPlatformFromUrl('CatFK'), '云猫寄售');
  assert.equal(shopPlatformFromUrl('self-hosted'), 'self-hosted');
});


test('self-hosted merchants require a warning regardless of partnership or support', () => {
  for (const sponsor of [false, true]) {
    for (const supportTotalCents of [0, 10000]) {
      const selfHosted = { platformName: '', sponsor, supportTotalCents };
      assert.equal(requiresProductRiskConfirmation(selfHosted), true);
      for (const platformName of ['链动小铺', '16688', '云猫寄售']) {
        assert.equal(requiresProductRiskConfirmation({ ...selfHosted, platformName }), false);
      }
    }
  }
});
