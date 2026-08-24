import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VOICE_HISTORY_STORAGE_KEY,
  VOICE_HISTORY_MAX_RECORDS,
  loadVoiceHistory,
  addVoiceHistoryRecord
} from './voiceHistoryStore.js';

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, value)
  };
}

test('loadVoiceHistory returns an empty array when nothing is stored', () => {
  assert.deepEqual(loadVoiceHistory(createMemoryStorage()), []);
});

test('loadVoiceHistory returns an empty array when the stored value is not valid JSON', () => {
  const storage = createMemoryStorage();
  storage.setItem(VOICE_HISTORY_STORAGE_KEY, 'not json');
  assert.deepEqual(loadVoiceHistory(storage), []);
});

test('addVoiceHistoryRecord stores transcript, diameter, alloy, id, timestamp', () => {
  const storage = createMemoryStorage();
  const list = addVoiceHistoryRecord(storage, '8mm 6061', 8, '6061');
  assert.equal(list.length, 1);
  assert.equal(list[0].transcript, '8mm 6061');
  assert.equal(list[0].diameter, 8);
  assert.equal(list[0].alloy, '6061');
  assert.ok(list[0].id);
  assert.ok(list[0].timestamp);
});

test('addVoiceHistoryRecord puts the newest record first', () => {
  const storage = createMemoryStorage();
  addVoiceHistoryRecord(storage, '8mm 6061', 8, '6061');
  addVoiceHistoryRecord(storage, '10mm 7075', 10, '7075');
  const list = loadVoiceHistory(storage);
  assert.equal(list[0].diameter, 10);
  assert.equal(list[1].diameter, 8);
});

test('addVoiceHistoryRecord keeps only the most recent 20 records', () => {
  const storage = createMemoryStorage();
  for (let i = 0; i < VOICE_HISTORY_MAX_RECORDS + 5; i++) {
    addVoiceHistoryRecord(storage, `record ${i}`, 8, '6061');
  }
  const list = loadVoiceHistory(storage);
  assert.equal(list.length, VOICE_HISTORY_MAX_RECORDS);
  assert.equal(list[0].transcript, `record ${VOICE_HISTORY_MAX_RECORDS + 4}`);
});
