import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeResult } from '../core/materials.js';
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

test('addHistoryRecord stores diameter, material label, drill material, and the result', () => {
  const storage = createMemoryStorage();
  const result = computeResult(8, 'aluminum', '6061', 'hss');
  const list = addHistoryRecord(storage, 8, 'aluminum', '6061', 'hss', result);
  assert.equal(list.length, 1);
  assert.equal(list[0].diameter, 8);
  assert.equal(list[0].materialKey, 'aluminum');
  assert.equal(list[0].subtypeKey, '6061');
  assert.equal(list[0].materialLabel, '6061');
  assert.equal(list[0].drillMat, 'hss');
  assert.equal(list[0].drillMatLabel, '高速鋼 HSS');
  assert.equal(list[0].result.rpm, result.rpm);
  assert.ok(list[0].id);
  assert.ok(list[0].timestamp);
});

test('addHistoryRecord works for a single-subtype material like stainless', () => {
  const storage = createMemoryStorage();
  const result = computeResult(8, 'stainless', 'standard', 'carbide');
  const list = addHistoryRecord(storage, 8, 'stainless', 'standard', 'carbide', result);
  assert.equal(list[0].materialLabel, '不鏽鋼(304/316 通用)');
});

test('addHistoryRecord puts the newest record first', () => {
  const storage = createMemoryStorage();
  const r1 = computeResult(8, 'aluminum', '6061', 'hss');
  const r2 = computeResult(10, 'aluminum', '7075', 'carbide');
  addHistoryRecord(storage, 8, 'aluminum', '6061', 'hss', r1);
  addHistoryRecord(storage, 10, 'aluminum', '7075', 'carbide', r2);
  const list = loadHistory(storage);
  assert.equal(list[0].diameter, 10);
  assert.equal(list[1].diameter, 8);
});

test('deleteHistoryRecord removes only the matching record', () => {
  const storage = createMemoryStorage();
  const r1 = computeResult(8, 'aluminum', '6061', 'hss');
  addHistoryRecord(storage, 8, 'aluminum', '6061', 'hss', r1);
  const [{ id }] = loadHistory(storage);
  const r2 = computeResult(10, 'aluminum', '7075', 'carbide');
  addHistoryRecord(storage, 10, 'aluminum', '7075', 'carbide', r2);
  const remaining = deleteHistoryRecord(storage, id);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].diameter, 10);
});

test('clearHistory empties the stored list', () => {
  const storage = createMemoryStorage();
  const result = computeResult(8, 'aluminum', '6061', 'hss');
  addHistoryRecord(storage, 8, 'aluminum', '6061', 'hss', result);
  clearHistory(storage);
  assert.deepEqual(loadHistory(storage), []);
});

test('addHistoryRecord stores depth as null when not provided (backward compatible)', () => {
  const storage = createMemoryStorage();
  const result = computeResult(8, 'aluminum', '6061', 'hss');
  const list = addHistoryRecord(storage, 8, 'aluminum', '6061', 'hss', result);
  assert.equal(list[0].depth, null);
  assert.equal(list[0].deepHoleWarning, null);
});

test('addHistoryRecord stores the depth and deep-hole warning when provided', () => {
  const storage = createMemoryStorage();
  const result = computeResult(8, 'aluminum', '6061', 'hss', 40);
  const list = addHistoryRecord(storage, 8, 'aluminum', '6061', 'hss', result, 40);
  assert.equal(list[0].depth, 40);
  assert.ok(list[0].deepHoleWarning);
  assert.ok(list[0].deepHoleWarning.includes('深孔'));
});

test('addHistoryRecord stores a shallow depth without a deep-hole warning', () => {
  const storage = createMemoryStorage();
  const result = computeResult(8, 'aluminum', '6061', 'hss', 10);
  const list = addHistoryRecord(storage, 8, 'aluminum', '6061', 'hss', result, 10);
  assert.equal(list[0].depth, 10);
  assert.equal(list[0].deepHoleWarning, null);
});
