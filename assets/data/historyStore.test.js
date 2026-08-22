import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAllResults } from '../core/materials.js';
import {
  HISTORY_STORAGE_KEY,
  loadHistory,
  addHistoryRecord,
  deleteHistoryRecord,
  clearHistory
} from './historyStore.js';

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, value)
  };
}

test('loadHistory returns an empty array when nothing is stored', () => {
  assert.deepEqual(loadHistory(createMemoryStorage()), []);
});

test('loadHistory returns an empty array when the stored value is not valid JSON', () => {
  const storage = createMemoryStorage();
  storage.setItem(HISTORY_STORAGE_KEY, 'not json');
  assert.deepEqual(loadHistory(storage), []);
});

test('addHistoryRecord stores a record with id, timestamp, and all three material results', () => {
  const storage = createMemoryStorage();
  const { results } = computeAllResults(8, '6061');
  const list = addHistoryRecord(storage, 8, '6061', results);
  assert.equal(list.length, 1);
  assert.equal(list[0].diameter, 8);
  assert.equal(list[0].alloyLabel, '6061');
  assert.equal(list[0].results.length, 3);
  assert.ok(list[0].id);
  assert.ok(list[0].timestamp);
});

test('addHistoryRecord puts the newest record first', () => {
  const storage = createMemoryStorage();
  const { results } = computeAllResults(8, '6061');
  addHistoryRecord(storage, 8, '6061', results);
  addHistoryRecord(storage, 10, '7075', results);
  const list = loadHistory(storage);
  assert.equal(list[0].diameter, 10);
  assert.equal(list[1].diameter, 8);
});

test('deleteHistoryRecord removes only the matching record', () => {
  const storage = createMemoryStorage();
  const { results } = computeAllResults(8, '6061');
  addHistoryRecord(storage, 8, '6061', results);
  const [{ id }] = loadHistory(storage);
  addHistoryRecord(storage, 10, '7075', results);
  const remaining = deleteHistoryRecord(storage, id);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].diameter, 10);
});

test('clearHistory empties the stored list', () => {
  const storage = createMemoryStorage();
  const { results } = computeAllResults(8, '6061');
  addHistoryRecord(storage, 8, '6061', results);
  clearHistory(storage);
  assert.deepEqual(loadHistory(storage), []);
});
