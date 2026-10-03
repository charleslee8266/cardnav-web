import assert from 'node:assert/strict';
import test from 'node:test';
import { officialPriceBaseline, officialPriceDifference } from '../src/official-price.js';
import type { PublicOfficialPriceRow } from '../src/store.js';
const price = (overrides: Partial<PublicOfficialPriceRow> = {}) => ({ appSlug: 'example', planSlug: 'monthly', countryCode: 'US', currencyCode: 'USD', priceValue: 20, cnyPrice: 140, ...overrides } as PublicOfficialPriceRow);
test('baseline is the actual same-plan U.S. price and comparisons preserve signed differences', () => {
  const us = price();
  const cheaper = price({ countryCode: 'IN', cnyPrice: 70 });
  const dearer = price({ countryCode: 'GB', cnyPrice: 175 });
  assert.equal(officialPriceBaseline([cheaper, dearer, us]), us);
  assert.equal(officialPriceDifference(cheaper, us), -50);
  assert.equal(officialPriceDifference(dearer, us), 25);
  assert.equal(officialPriceDifference(us, us), 0);
  assert.equal(officialPriceDifference(price({ cnyPrice: 0 }), us), -100);
});
test('missing, zero, non-finite and cross-plan baselines do not fabricate comparisons', () => {
  assert.equal(officialPriceBaseline([price({ countryCode: 'CA' }), price({ currencyCode: 'EUR' }), price({ cnyPrice: 0 })]), null);
  for (const baseline of [null, price({ cnyPrice: 0 }), price({ cnyPrice: NaN }), price({ planSlug: 'annual' }), price({ appSlug: 'other' })]) assert.equal(officialPriceDifference(price(), baseline), null);
  assert.equal(officialPriceDifference(price({ cnyPrice: Infinity }), price()), null);
});
