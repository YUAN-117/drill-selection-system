import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeResult } from '../core/materials.js';
import { formatNumber } from '../core/format.js';
import {
  renderMaterialOptionsHtml,
  renderDrillMatOptionsHtml,
  renderResultRow,
  renderGuidanceHtml,
  renderDiameterHint,
  renderDeepHoleWarningHtml
} from './toolView.js';

test('renderMaterialOptionsHtml groups aluminum subtypes under one optgroup', () => {
  const html = renderMaterialOptionsHtml();
  assert.ok(html.includes('<optgroup label="鋁合金">'));
  assert.ok(html.includes('value="aluminum:6061"'));
  assert.ok(html.includes('value="aluminum:custom"'));
});

test('renderMaterialOptionsHtml puts single-subtype materials as top-level options, not optgroups', () => {
  const html = renderMaterialOptionsHtml();
  assert.ok(html.includes('<option value="stainless:standard">不鏽鋼(304/316 通用)</option>'));
  assert.ok(!html.includes('<optgroup label="不鏽鋼">'));
});

test('renderMaterialOptionsHtml includes all six material categories', () => {
  const html = renderMaterialOptionsHtml();
  for (const key of ['aluminum:6061', 'copper:brass', 'stainless:standard', 'peek:standard', 'pc:standard', 'pom:standard']) {
    assert.ok(html.includes('value="' + key + '"'), key + ' missing');
  }
});

test('renderDrillMatOptionsHtml shows the aluminum Vc ranges', () => {
  const html = renderDrillMatOptionsHtml('aluminum');
  assert.ok(html.includes('高速鋼 HSS(建議 30–60 m/min)'));
  assert.ok(html.includes('硬質合金(建議 150–300 m/min)'));
  assert.ok(html.includes('塗層硬質合金(建議 200–350 m/min)'));
});

test('renderDrillMatOptionsHtml shows different ranges for a different material', () => {
  const html = renderDrillMatOptionsHtml('stainless');
  assert.ok(html.includes('高速鋼 HSS(建議 8–15 m/min)'));
  assert.ok(!html.includes('30–60 m/min'));
});

test('renderResultRow shows the adopted Vc, its reference range, RPM, and feed for the selected drill material', () => {
  const result = computeResult(8, 'aluminum', '6061', 'hss');
  const row = renderResultRow(result, 'aluminum');
  assert.ok(row.includes('高速鋼 HSS'));
  assert.ok(row.includes('30–60 m/min'));
  assert.ok(row.includes(formatNumber(result.rpm, 0)));
});

test('renderResultRow flags low-confidence estimates', () => {
  const result = computeResult(8, 'stainless', 'standard', 'coated');
  const row = renderResultRow(result, 'stainless');
  assert.ok(row.includes('⚠ 推估參考'));
});

test('renderResultRow does not flag high-confidence results', () => {
  const result = computeResult(8, 'aluminum', '6061', 'hss');
  const row = renderResultRow(result, 'aluminum');
  assert.ok(!row.includes('⚠ 推估參考'));
});

test('renderGuidanceHtml returns the caveat text for the given material', () => {
  assert.ok(renderGuidanceHtml('pom').includes('維持進給速度'));
  assert.ok(renderGuidanceHtml('aluminum').includes('高速鋼'));
});

test('renderDiameterHint behavior for standard and non-standard sizes is unchanged', () => {
  assert.equal(renderDiameterHint(8, 8), '✓ 市售標準鑽頭尺寸');
  assert.ok(renderDiameterHint(3.672, 3.7).includes('3.7'));
});

test('renderDeepHoleWarningHtml returns the warning text when provided', () => {
  assert.equal(renderDeepHoleWarningHtml('⚠ 深孔警告文字'), '⚠ 深孔警告文字');
});

test('renderDeepHoleWarningHtml returns an empty string when there is no warning', () => {
  assert.equal(renderDeepHoleWarningHtml(null), '');
});
