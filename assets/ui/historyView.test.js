import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAllResults } from '../core/materials.js';
import { renderHistoryList, EMPTY_STATE_HTML } from './historyView.js';

test('renderHistoryList shows the empty state for an empty list', () => {
  assert.equal(renderHistoryList([]), EMPTY_STATE_HTML);
});

test('renderHistoryList renders a record with its diameter, alloy, and all three material rows', () => {
  const { results } = computeAllResults(8, '6061');
  const record = {
    id: 'abc123',
    timestamp: '2026-08-22T00:00:00.000Z',
    diameter: 8,
    alloy: '6061',
    alloyLabel: '6061',
    results
  };
  const html = renderHistoryList([record]);
  assert.match(html, /8mm · 6061/);
  assert.match(html, /高速鋼 HSS/);
  assert.match(html, /2,029/);
  assert.match(html, /data-id="abc123"/);
});
