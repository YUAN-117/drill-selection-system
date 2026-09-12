import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeResult } from '../core/materials.js';
import { loadCloudHistory, addCloudHistoryRecord, deleteCloudHistoryRecord, clearCloudHistory } from './cloudHistoryStore.js';

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

test('loadCloudHistory maps Supabase rows into record objects', async () => {
  const supabase = createFakeSupabase({
    data: [
      {
        id: 7,
        created_at: '2026-09-12T03:00:00.000Z',
        record: { diameter: 8, materialKey: 'aluminum', subtypeKey: '6061', materialLabel: '6061', drillMat: 'hss', drillMatLabel: '高速鋼 HSS', depth: null, deepHoleWarning: null, result: { rpm: 2029 } }
      }
    ],
    error: null
  });
  const list = await loadCloudHistory(supabase, 'user-1');
  assert.equal(list.length, 1);
  assert.equal(list[0].id, '7');
  assert.equal(list[0].timestamp, '2026-09-12T03:00:00.000Z');
  assert.equal(list[0].diameter, 8);
  assert.equal(list[0].materialLabel, '6061');
  assert.equal(list[0].result.rpm, 2029);
});

test('loadCloudHistory throws when Supabase returns an error', async () => {
  const supabase = createFakeSupabase({ data: null, error: { message: 'network error' } });
  await assert.rejects(() => loadCloudHistory(supabase, 'user-1'));
});

test('addCloudHistoryRecord inserts a record shaped like the local store and returns it mapped back', async () => {
  const result = computeResult(8, 'aluminum', '6061', 'hss');
  const supabase = createFakeSupabase({
    data: {
      id: 12,
      created_at: '2026-09-12T04:00:00.000Z',
      record: {
        diameter: 8,
        materialKey: 'aluminum',
        subtypeKey: '6061',
        materialLabel: '6061',
        drillMat: 'hss',
        drillMatLabel: result.drillMatLabel,
        depth: null,
        deepHoleWarning: null,
        result
      }
    },
    error: null
  });
  const record = await addCloudHistoryRecord(supabase, 'user-1', 8, 'aluminum', '6061', 'hss', result);
  assert.equal(record.id, '12');
  assert.equal(record.materialLabel, '6061');
  assert.equal(record.drillMat, 'hss');
  assert.equal(record.depth, null);
  assert.equal(record.result.rpm, result.rpm);
});

test('addCloudHistoryRecord throws when Supabase returns an error', async () => {
  const result = computeResult(8, 'aluminum', '6061', 'hss');
  const supabase = createFakeSupabase({ data: null, error: { message: 'insert failed' } });
  await assert.rejects(() => addCloudHistoryRecord(supabase, 'user-1', 8, 'aluminum', '6061', 'hss', result));
});

test('deleteCloudHistoryRecord resolves when Supabase reports no error', async () => {
  const supabase = createFakeSupabase({ data: null, error: null });
  await assert.doesNotReject(() => deleteCloudHistoryRecord(supabase, 'user-1', '12'));
});

test('deleteCloudHistoryRecord throws when Supabase returns an error', async () => {
  const supabase = createFakeSupabase({ data: null, error: { message: 'delete failed' } });
  await assert.rejects(() => deleteCloudHistoryRecord(supabase, 'user-1', '12'));
});

test('clearCloudHistory resolves when Supabase reports no error', async () => {
  const supabase = createFakeSupabase({ data: null, error: null });
  await assert.doesNotReject(() => clearCloudHistory(supabase, 'user-1'));
});

test('clearCloudHistory throws when Supabase returns an error', async () => {
  const supabase = createFakeSupabase({ data: null, error: { message: 'clear failed' } });
  await assert.rejects(() => clearCloudHistory(supabase, 'user-1'));
});
