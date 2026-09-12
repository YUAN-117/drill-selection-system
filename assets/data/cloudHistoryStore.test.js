import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCloudHistory } from './cloudHistoryStore.js';

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
