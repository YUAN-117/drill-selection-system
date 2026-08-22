import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAllResults } from '../core/materials.js';
import { renderCompareRows, renderDiameterHint } from './toolView.js';

test('renderCompareRows includes all three material labels and their RPM values', () => {
  const { results } = computeAllResults(8, '6061');
  const html = renderCompareRows(results);
  assert.match(html, /高速鋼 HSS/);
  assert.match(html, /2,029/);
  assert.match(html, /硬質合金/);
  assert.match(html, /10,146/);
  assert.match(html, /塗層硬質合金/);
  assert.match(html, /12,136/);
});

test('renderDiameterHint shows a checkmark for an already-standard diameter', () => {
  assert.equal(renderDiameterHint(8, 8), '✓ 市售標準鑽頭尺寸');
});

test('renderDiameterHint explains the snap for a non-standard diameter', () => {
  const html = renderDiameterHint(3.672, 3.7);
  assert.match(html, /3\.672mm 非市售規格/);
  assert.match(html, /3\.7 mm/);
});
