import assert from 'node:assert/strict';
import test from 'node:test';
import { shopPlatformName, shopPlatformFromUrl } from '../src/shop-platform.js';

test('hosting identities use the public brand and keep self-hosted sites outside hosted platforms', () => {
  assert.equal(shopPlatformName('platform-catfk'), '云猫寄售');
  assert.equal(shopPlatformName('platform-wzyp'), '链动小铺');
  assert.equal(shopPlatformName('platform-16688'), '16688');
  assert.equal(shopPlatformName('unknown'), '');
  assert.equal(shopPlatformName('dujiaoka'), '');
  assert.equal(shopPlatformFromUrl('CatFK'), '云猫寄售');
  assert.equal(shopPlatformFromUrl('self-hosted'), 'self-hosted');
});
