import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTapDrillSize } from '../core/tapDrill.js';
import { TAP_DRILL_CAVEAT, renderSizeOptionsHtml, renderTapResultHtml } from './tapDrillView.js';

test('renderSizeOptionsHtml lists metric nominal sizes as options', () => {
  const html = renderSizeOptionsHtml('metric');
  assert.ok(html.includes('<option value="M6">M6</option>'));
  assert.ok(html.includes('<option value="M24">M24</option>'));
});

test('renderSizeOptionsHtml lists imperial nominal sizes as options', () => {
  const html = renderSizeOptionsHtml('imperial');
  assert.ok(html.includes('<option value="1/4">1/4</option>'));
  assert.ok(html.includes('<option value="#4">#4</option>'));
});

test('renderTapResultHtml shows the metric coarse thread label, pitch, and drill diameter', () => {
  const result = getTapDrillSize('metric', 'M6');
  const html = renderTapResultHtml(result);
  assert.ok(html.includes('M6'));
  assert.ok(html.includes('粗牙'));
  assert.ok(html.includes('螺距 1'));
  assert.ok(html.includes('5'));
});

test('renderTapResultHtml shows 細牙 label for a metric fine result', () => {
  const result = getTapDrillSize('metric', 'M6', { fine: true });
  const html = renderTapResultHtml(result);
  assert.ok(html.includes('細牙'));
  assert.ok(!html.includes('粗牙'));
});

test('renderTapResultHtml shows the imperial coarse thread label with UNC, TPI, and an inch mark', () => {
  const result = getTapDrillSize('imperial', '1/4');
  const html = renderTapResultHtml(result);
  assert.ok(html.includes('1/4"'));
  assert.ok(html.includes('UNC'));
  assert.ok(html.includes('20'));
});

test('renderTapResultHtml shows UNF for an imperial fine result', () => {
  const result = getTapDrillSize('imperial', '1/4', { fine: true });
  const html = renderTapResultHtml(result);
  assert.ok(html.includes('UNF'));
});

test('renderTapResultHtml formats a numbered imperial size without a trailing inch mark', () => {
  const result = getTapDrillSize('imperial', '#4');
  const html = renderTapResultHtml(result);
  assert.ok(html.includes('#4'));
  assert.ok(!html.includes('#4"'));
});

test('renderTapResultHtml includes the standard caveat text', () => {
  const result = getTapDrillSize('metric', 'M6');
  const html = renderTapResultHtml(result);
  assert.ok(html.includes(TAP_DRILL_CAVEAT));
});
