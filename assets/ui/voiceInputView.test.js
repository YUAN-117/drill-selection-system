import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMicButtonLabel, renderErrorMessage, renderLoginStatus } from './voiceInputView.js';

test('renderMicButtonLabel has a distinct label per state', () => {
  const idle = renderMicButtonLabel('idle');
  const listening = renderMicButtonLabel('listening');
  const processing = renderMicButtonLabel('processing');
  assert.notEqual(idle, listening);
  assert.notEqual(idle, processing);
  assert.notEqual(listening, processing);
});

test('renderMicButtonLabel falls back to the idle label for an unknown state', () => {
  assert.equal(renderMicButtonLabel('bogus'), renderMicButtonLabel('idle'));
});

test('renderErrorMessage returns a distinct message for each known backend error code', () => {
  const codes = ['NOT_AUTHENTICATED', 'EMPTY', 'TOO_LONG', 'RATE_LIMITED', 'PARSE_FAILED', 'AI_UNAVAILABLE', 'NETWORK_ERROR', 'NOT_SUPPORTED'];
  const messages = codes.map(renderErrorMessage);
  assert.equal(new Set(messages).size, codes.length);
});

test('renderErrorMessage falls back to a generic message for an unknown code', () => {
  assert.equal(typeof renderErrorMessage('SOME_UNKNOWN_CODE'), 'string');
});

test('renderLoginStatus reports signed-out state with a login button', () => {
  assert.deepEqual(renderLoginStatus(null), { label: '未登入', showLoginButton: true });
});

test('renderLoginStatus reports the signed-in email without a login button', () => {
  const session = { user: { email: 'a@example.com' } };
  const result = renderLoginStatus(session);
  assert.equal(result.showLoginButton, false);
  assert.ok(result.label.includes('a@example.com'));
});
