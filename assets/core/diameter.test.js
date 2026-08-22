import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STANDARD_SIZES, nearestStandardDiameter } from './diameter.js';

test('nearestStandardDiameter returns the exact value when already standard', () => {
  assert.equal(nearestStandardDiameter(8), 8);
});

test('nearestStandardDiameter snaps a non-standard value to the closest standard size', () => {
  assert.equal(nearestStandardDiameter(3.672), 3.7);
});

test('nearestStandardDiameter clamps values above the largest standard size', () => {
  assert.equal(nearestStandardDiameter(40), 32);
});

test('nearestStandardDiameter clamps values below the smallest standard size', () => {
  assert.equal(nearestStandardDiameter(0.5), 1);
});

test('STANDARD_SIZES spans from 1.0mm to 32.0mm', () => {
  assert.equal(STANDARD_SIZES[0], 1);
  assert.equal(STANDARD_SIZES[STANDARD_SIZES.length - 1], 32);
});
