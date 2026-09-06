import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVoiceToolInput } from './parseAiResponse.js';

test('accepts a complete, in-range result for a new material', () => {
  assert.deepEqual(parseVoiceToolInput({ diameter: 8, material: 'stainless:standard' }), {
    diameter: 8,
    material: 'stainless:standard'
  });
});

test('accepts an aluminum result (existing behavior preserved)', () => {
  assert.deepEqual(parseVoiceToolInput({ diameter: 8, material: 'aluminum:6061' }), {
    diameter: 8,
    material: 'aluminum:6061'
  });
});

test('rejects a missing diameter', () => {
  assert.equal(parseVoiceToolInput({ material: 'stainless:standard' }), null);
});

test('rejects a missing material', () => {
  assert.equal(parseVoiceToolInput({ diameter: 8 }), null);
});

test('rejects a material outside the known set', () => {
  assert.equal(parseVoiceToolInput({ diameter: 8, material: 'titanium:standard' }), null);
});

test('rejects the bare old-style key without a category prefix', () => {
  assert.equal(parseVoiceToolInput({ diameter: 8, material: '6061' }), null);
});

test('rejects aluminum:custom (never offered to the AI)', () => {
  assert.equal(parseVoiceToolInput({ diameter: 8, material: 'aluminum:custom' }), null);
});

test('rejects a diameter outside the valid drill range', () => {
  assert.equal(parseVoiceToolInput({ diameter: 0, material: 'aluminum:6061' }), null);
  assert.equal(parseVoiceToolInput({ diameter: 999, material: 'aluminum:6061' }), null);
});

test('rejects a non-numeric diameter', () => {
  assert.equal(parseVoiceToolInput({ diameter: '8', material: 'aluminum:6061' }), null);
});

test('rejects a null or missing tool input', () => {
  assert.equal(parseVoiceToolInput(null), null);
  assert.equal(parseVoiceToolInput(undefined), null);
});
