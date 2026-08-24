import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVoiceInput, EDGE_FUNCTION_URL } from './voiceParseClient.js';

function fakeFetch(responseBody, { ok = true } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok, json: async () => responseBody };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

test('returns the parsed result on success', async () => {
  const fetchImpl = fakeFetch({ ok: true, diameter: 8, alloy: '6061' });
  const result = await parseVoiceInput({ fetchImpl, transcript: '8mm 6061', accessToken: 'tok' });
  assert.deepEqual(result, { ok: true, diameter: 8, alloy: '6061' });
});

test('passes the transcript, auth header, and correct URL', async () => {
  const fetchImpl = fakeFetch({ ok: true, diameter: 8, alloy: '6061' });
  await parseVoiceInput({ fetchImpl, transcript: '8mm 6061', accessToken: 'my-token' });
  const [{ url, options }] = fetchImpl.calls;
  assert.equal(url, EDGE_FUNCTION_URL);
  assert.equal(options.method, 'POST');
  assert.equal(options.headers.Authorization, 'Bearer my-token');
  assert.deepEqual(JSON.parse(options.body), { transcript: '8mm 6061' });
});

test('passes through an error code from the backend (e.g. rate limited)', async () => {
  const fetchImpl = fakeFetch({ ok: false, code: 'RATE_LIMITED', limit: 15 }, { ok: false });
  const result = await parseVoiceInput({ fetchImpl, transcript: '8mm 6061', accessToken: 'tok' });
  assert.deepEqual(result, { ok: false, code: 'RATE_LIMITED', limit: 15 });
});

test('returns NETWORK_ERROR when fetch throws', async () => {
  const fetchImpl = async () => { throw new Error('offline'); };
  const result = await parseVoiceInput({ fetchImpl, transcript: '8mm 6061', accessToken: 'tok' });
  assert.deepEqual(result, { ok: false, code: 'NETWORK_ERROR' });
});

test('returns NETWORK_ERROR when the response body is not valid JSON', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => { throw new Error('bad json'); } });
  const result = await parseVoiceInput({ fetchImpl, transcript: '8mm 6061', accessToken: 'tok' });
  assert.deepEqual(result, { ok: false, code: 'NETWORK_ERROR' });
});
