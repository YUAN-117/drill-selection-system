import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeResult } from '../core/materials.js';
import { formatNumber } from '../core/format.js';
import { EMPTY_STATE_HTML, renderHistoryRecord, renderHistoryList, LOADING_STATE_HTML, renderLoadErrorHtml } from './historyView.js';

function makeRecord(overrides = {}) {
  const result = computeResult(8, 'aluminum', '6061', 'hss');
  return {
    id: 'abc123',
    timestamp: new Date('2026-08-24T10:00:00Z').toISOString(),
    diameter: 8,
    materialKey: 'aluminum',
    subtypeKey: '6061',
    materialLabel: '6061',
    drillMat: 'hss',
    drillMatLabel: '高速鋼 HSS',
    result,
    ...overrides
  };
}

test('renderHistoryList shows the empty state for an empty list', () => {
  assert.equal(renderHistoryList([]), EMPTY_STATE_HTML);
});

test('renderHistoryList skips old-format records instead of throwing', () => {
  const oldFormatRecord = {
    id: 'old1',
    timestamp: new Date('2026-08-20T10:00:00Z').toISOString(),
    diameter: 8,
    alloy: '6061',
    alloyLabel: '6061',
    results: []
  };
  const html = renderHistoryList([oldFormatRecord, makeRecord()]);
  assert.ok(!html.includes('data-id="old1"'));
  assert.ok(html.includes('data-id="abc123"'));
});

test('renderHistoryList shows the empty state when only old-format records remain', () => {
  const oldFormatRecord = { id: 'old1', diameter: 8, alloy: '6061', results: [] };
  assert.equal(renderHistoryList([oldFormatRecord]), EMPTY_STATE_HTML);
});

test('renderHistoryRecord shows the diameter, material label, and drill material', () => {
  const record = makeRecord();
  const html = renderHistoryRecord(record);
  assert.ok(html.includes('8mm · 6061'));
  assert.ok(html.includes('高速鋼 HSS'));
  assert.ok(html.includes(formatNumber(record.result.rpm, 0)));
});

test('renderHistoryRecord shows a single-subtype material label correctly', () => {
  const result = computeResult(8, 'stainless', 'standard', 'carbide');
  const record = makeRecord({
    materialKey: 'stainless',
    subtypeKey: 'standard',
    materialLabel: '不鏽鋼(304/316 通用)',
    drillMat: 'carbide',
    drillMatLabel: result.drillMatLabel,
    result
  });
  const html = renderHistoryRecord(record);
  assert.ok(html.includes('8mm · 不鏽鋼(304/316 通用)'));
});

test('renderHistoryRecord flags a low-confidence result', () => {
  const result = computeResult(8, 'stainless', 'standard', 'coated');
  const record = makeRecord({
    materialKey: 'stainless',
    subtypeKey: 'standard',
    materialLabel: '不鏽鋼(304/316 通用)',
    drillMat: 'coated',
    drillMatLabel: result.drillMatLabel,
    result
  });
  const html = renderHistoryRecord(record);
  assert.ok(html.includes('⚠ 推估參考'));
});

test('renderHistoryRecord does not flag a high-confidence result', () => {
  const html = renderHistoryRecord(makeRecord());
  assert.ok(!html.includes('⚠ 推估參考'));
});

test('renderHistoryRecord includes a delete button with the record id', () => {
  const html = renderHistoryRecord(makeRecord());
  assert.ok(html.includes('data-id="abc123"'));
});

test('renderHistoryList renders multiple records joined together', () => {
  const html = renderHistoryList([makeRecord(), makeRecord({ id: 'def456' })]);
  assert.ok(html.includes('data-id="abc123"'));
  assert.ok(html.includes('data-id="def456"'));
});

test('renderHistoryRecord shows the depth in the title when present', () => {
  const record = makeRecord({ depth: 40 });
  const html = renderHistoryRecord(record);
  assert.ok(html.includes('8mm(孔深 40mm) · 6061'));
});

test('renderHistoryRecord does not show a depth note when depth is absent', () => {
  const html = renderHistoryRecord(makeRecord());
  assert.ok(html.includes('8mm · 6061'));
  assert.ok(!html.includes('孔深'));
});

test('renderHistoryRecord shows the deep-hole warning line when present', () => {
  const record = makeRecord({ depth: 40, deepHoleWarning: '⚠ 深孔警告文字' });
  const html = renderHistoryRecord(record);
  assert.ok(html.includes('⚠ 深孔警告文字'));
});

test('renderHistoryRecord shows no warning line when deepHoleWarning is absent', () => {
  const html = renderHistoryRecord(makeRecord());
  assert.ok(!html.includes('record-deep-hole-warning'));
});

test('LOADING_STATE_HTML shows a loading message', () => {
  assert.ok(LOADING_STATE_HTML.includes('載入中'));
});

test('renderLoadErrorHtml renders the given error message', () => {
  const html = renderLoadErrorHtml('無法載入雲端紀錄,請檢查網路連線後重新整理');
  assert.ok(html.includes('無法載入雲端紀錄,請檢查網路連線後重新整理'));
});
