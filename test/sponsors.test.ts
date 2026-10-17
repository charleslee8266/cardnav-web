/** Sponsor placement and locale fallback remain stable across database updates. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { getSponsorListId, resolveSponsor } from '../src/sponsor-provider.js';

test('page placements resolve to the configured list identity', () => {
  assert.equal(getSponsorListId({ placement: 'after-hero', pageType: 'gateway' }), 'gateways');
  assert.equal(getSponsorListId({ placement: 'after-hero', pageType: 'shops' }), 'shop');
  assert.equal(getSponsorListId({ placement: 'after-hero', pageType: 'shop-keyword' }), 'shop');
  for (const pageType of ['official-price', 'official-price-detail'] as const) {
    assert.equal(getSponsorListId({ placement: 'after-hero', pageType }), 'official-price');
  }
  for (const pageType of ['model-leaderboard', 'model-leaderboard-detail'] as const) {
    assert.equal(getSponsorListId({ placement: 'after-hero', pageType }), 'model-leaderboard');
  }
  assert.equal(getSponsorListId({ placement: 'page-bottom', pageType: 'about' }), 'full');
  for (const pageType of ['shop-detail', 'gateway-detail'] as const) {
    assert.equal(getSponsorListId({ placement: 'page-bottom', pageType }), 'full');
    assert.equal(getSponsorListId({ placement: 'after-hero', pageType }), null);
  }
  assert.equal(getSponsorListId({ placement: 'page-bottom', pageType: 'guide' }), null);
  assert.equal(getSponsorListId({ placement: 'content-bottom', pageType: 'guide' }), 'full');
});

test('localized sponsor content preserves image settings and plan links', () => {
  const sponsor = resolveSponsor({
    id: 'example', template: 'grid',
    title: { default: 'Example', zh: '示例' }, description: { default: 'Description' },
    url: { default: 'https://example.com', zh: 'https://example.com/zh' },
    image: { src: '/media/sponsors/logo.png', scaleMode: 'contain', padding: '8px', alt: { default: '' } },
    links: [{ text: { zh: '套餐' }, url: { default: 'https://example.com/plan' }, color: 'red' }],
  }, 'en');
  assert.equal(sponsor.title, 'Example');
  assert.equal(sponsor.description, 'Description');
  assert.equal(sponsor.url, 'https://example.com');
  assert.deepEqual(sponsor.links, [{ text: '套餐', url: 'https://example.com/plan', color: 'red' }]);
  assert.equal(sponsor.image.padding, '8px');
});


test('optional description and image alt can be empty without suppressing the sponsor', () => {
  const sponsor = resolveSponsor({
    id: 'text-only', template: 'default', title: { zh: '赞助商' },
    description: {}, url: { default: 'https://example.com' },
    image: { src: '', scaleMode: 'contain', alt: {} },
  }, 'en');
  assert.equal(sponsor.title, '赞助商');
  assert.equal(sponsor.description, '');
  assert.equal(sponsor.image.alt, '');
  assert.equal(sponsor.image.src, '');
});
