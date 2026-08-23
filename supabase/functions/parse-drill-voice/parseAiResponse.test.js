import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVoiceToolInput } from './parseAiResponse.js';

test('accepts a complete, in-range result', () => {
  assert.deepEqual(parseVoiceToolInput({ diameter: 8, alloy: '6061' }), { diameter: 8, alloy: '6061' });
});

test('rejects a missing diameter', () => {
  assert.equal(parseVoiceToolInput({ alloy: '6061' }), null);
});

test('rejects a missing alloy', () => {
  assert.equal(parseVoiceToolInput({ diameter: 8 }), null);
});

test('rejects an alloy outside the known set', () => {
  assert.equal(parseVoiceToolInput({ diameter: 8, alloy: 'titanium' }), null);
});

test('rejects a diameter outside the valid drill range', () => {
  assert.equal(parseVoiceToolInput({ diameter: 0, alloy: '6061' }), null);
  assert.equal(parseVoiceToolInput({ diameter: 999, alloy: '6061' }), null);
});

test('rejects a non-numeric diameter', () => {
  assert.equal(parseVoiceToolInput({ diameter: '8', alloy: '6061' }), null);
});

test('rejects a null or missing tool input', () => {
  assert.equal(parseVoiceToolInput(null), null);
  assert.equal(parseVoiceToolInput(undefined), null);
});
