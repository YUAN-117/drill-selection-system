import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber } from './format.js';

test('formatNumber formats with a fixed number of decimal places and thousands separators', () => {
  assert.equal(formatNumber(2029, 0), '2,029');
  assert.equal(formatNumber(0.125, 2), '0.13');
});
