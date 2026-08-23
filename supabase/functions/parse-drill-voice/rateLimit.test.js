import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRateLimited, HOURLY_REQUEST_LIMIT } from './rateLimit.js';

test('allows requests below the limit', () => {
  assert.equal(isRateLimited(0), false);
  assert.equal(isRateLimited(HOURLY_REQUEST_LIMIT - 1), false);
});

test('blocks requests at or above the limit', () => {
  assert.equal(isRateLimited(HOURLY_REQUEST_LIMIT), true);
  assert.equal(isRateLimited(HOURLY_REQUEST_LIMIT + 5), true);
});

test('respects a custom limit override', () => {
  assert.equal(isRateLimited(3, 3), true);
  assert.equal(isRateLimited(2, 3), false);
});
