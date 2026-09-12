import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeResult } from '../core/materials.js';
import { addHistoryRecord } from './historyStore.js';
import { loadRecords, addRecord, deleteRecord, clearRecords } from './historyGateway.js';

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, value)
  };
}

function createFakeSupabase({ data, error }) {
  const builder = {
    select: () => builder,
    insert: () => builder,
    delete: () => builder,
    eq: () => builder,
    order: () => builder,
    single: () => Promise.resolve({ data, error }),
    then: (resolve) => resolve({ data, error })
  };
  return { from: () => builder };
}

test('loadRecords reads from local storage when there is no session', async () => {
  const storage = createMemoryStorage();
  const result = computeResult(8, 'aluminum', '6061', 'hss');
  addHistoryRecord(storage, 8, 'aluminum', '6061', 'hss', result);
  const list = await loadRecords(null, storage, null);
  assert.equal(list.length, 1);
  assert.equal(list[0].diameter, 8);
});

test('loadRecords reads from Supabase when a session is present', async () => {
  const session = { user: { id: 'user-1' } };
  const supabase = createFakeSupabase({
    data: [{ id: 3, created_at: '2026-09-12T05:00:00.000Z', record: { diameter: 10, materialKey: 'aluminum' } }],
    error: null
  });
  const list = await loadRecords(session, null, supabase);
  assert.equal(list.length, 1);
  assert.equal(list[0].diameter, 10);
});

test('addRecord writes to local storage when there is no session', async () => {
  const storage = createMemoryStorage();
  const result = computeResult(8, 'aluminum', '6061', 'hss');
  const record = await addRecord(null, storage, null, 8, 'aluminum', '6061', 'hss', result);
  assert.equal(record.diameter, 8);
  assert.equal(JSON.parse(storage.getItem('drillSelectionHistory_v1')).length, 1);
});

test('addRecord writes to Supabase when a session is present', async () => {
  const session = { user: { id: 'user-1' } };
  const result = computeResult(8, 'aluminum', '6061', 'hss');
  const supabase = createFakeSupabase({
    data: { id: 9, created_at: '2026-09-12T06:00:00.000Z', record: { diameter: 8, materialKey: 'aluminum', subtypeKey: '6061', materialLabel: '6061', drillMat: 'hss', drillMatLabel: result.drillMatLabel, depth: null, deepHoleWarning: null, result } },
    error: null
  });
  const record = await addRecord(session, null, supabase, 8, 'aluminum', '6061', 'hss', result);
  assert.equal(record.id, '9');
});

test('deleteRecord deletes from local storage when there is no session', async () => {
  const storage = createMemoryStorage();
  const result = computeResult(8, 'aluminum', '6061', 'hss');
  addHistoryRecord(storage, 8, 'aluminum', '6061', 'hss', result);
  const [{ id }] = JSON.parse(storage.getItem('drillSelectionHistory_v1'));
  await deleteRecord(null, storage, null, id);
  assert.equal(JSON.parse(storage.getItem('drillSelectionHistory_v1')).length, 0);
});

test('deleteRecord deletes from Supabase when a session is present', async () => {
  const session = { user: { id: 'user-1' } };
  const supabase = createFakeSupabase({ data: null, error: null });
  await assert.doesNotReject(() => deleteRecord(session, null, supabase, '9'));
});

test('clearRecords clears local storage when there is no session', async () => {
  const storage = createMemoryStorage();
  const result = computeResult(8, 'aluminum', '6061', 'hss');
  addHistoryRecord(storage, 8, 'aluminum', '6061', 'hss', result);
  await clearRecords(null, storage, null);
  assert.equal(JSON.parse(storage.getItem('drillSelectionHistory_v1')).length, 0);
});

test('clearRecords clears Supabase when a session is present', async () => {
  const session = { user: { id: 'user-1' } };
  const supabase = createFakeSupabase({ data: null, error: null });
  await assert.doesNotReject(() => clearRecords(session, null, supabase));
});
