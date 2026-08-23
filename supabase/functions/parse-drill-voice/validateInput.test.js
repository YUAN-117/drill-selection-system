import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTranscript, MAX_TRANSCRIPT_LENGTH } from './validateInput.js';

test('accepts a normal short transcript', () => {
  assert.deepEqual(validateTranscript('8mm 6061'), { valid: true, reason: null });
});

test('rejects an empty string', () => {
  assert.equal(validateTranscript('').valid, false);
  assert.equal(validateTranscript('').reason, 'EMPTY');
});

test('rejects a whitespace-only string', () => {
  assert.equal(validateTranscript('   ').reason, 'EMPTY');
});

test('rejects a non-string value', () => {
  assert.equal(validateTranscript(undefined).reason, 'EMPTY');
});

test('accepts a transcript exactly at the length limit', () => {
  const text = 'a'.repeat(MAX_TRANSCRIPT_LENGTH);
  assert.equal(validateTranscript(text).valid, true);
});

test('rejects a transcript over the length limit', () => {
  const text = 'a'.repeat(MAX_TRANSCRIPT_LENGTH + 1);
  assert.equal(validateTranscript(text).reason, 'TOO_LONG');
});
