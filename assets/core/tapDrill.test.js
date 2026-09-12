import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TAP_DRILL_SYSTEMS,
  getNominalSizes,
  hasFineOption,
  getTapDrillSize
} from './tapDrill.js';

test('TAP_DRILL_SYSTEMS lists metric and imperial', () => {
  assert.deepEqual(TAP_DRILL_SYSTEMS, ['metric', 'imperial']);
});

test('getNominalSizes returns metric sizes in ascending order', () => {
  assert.deepEqual(getNominalSizes('metric'), [
    'M2', 'M2.5', 'M3', 'M4', 'M5', 'M6', 'M8', 'M10',
    'M12', 'M14', 'M16', 'M18', 'M20', 'M22', 'M24'
  ]);
});

test('getNominalSizes returns imperial sizes in ascending order', () => {
  assert.deepEqual(getNominalSizes('imperial'), [
    '#4', '#6', '#8', '#10', '#12', '1/4', '5/16', '3/8',
    '7/16', '1/2', '9/16', '5/8', '3/4', '7/8', '1'
  ]);
});

test('getNominalSizes throws on an unknown system', () => {
  assert.throws(() => getNominalSizes('bogus'));
});

test('getTapDrillSize returns the M6 coarse tap drill (already a standard size, no snapping needed)', () => {
  const result = getTapDrillSize('metric', 'M6');
  assert.equal(result.system, 'metric');
  assert.equal(result.nominalSize, 'M6');
  assert.equal(result.isFine, false);
  assert.equal(result.pitch, 1.0);
  assert.equal(result.exactDrillDiameter, 5.0);
  assert.equal(result.standardDrillDiameter, 5.0);
});

test('getTapDrillSize returns the M6 fine tap drill when fine is requested', () => {
  const result = getTapDrillSize('metric', 'M6', { fine: true });
  assert.equal(result.isFine, true);
  assert.equal(result.pitch, 0.75);
  assert.equal(result.exactDrillDiameter, 5.25);
});

test('getTapDrillSize defaults to coarse when fine is not passed', () => {
  const result = getTapDrillSize('metric', 'M8');
  assert.equal(result.isFine, false);
  assert.equal(result.pitch, 1.25);
  assert.equal(result.exactDrillDiameter, 6.8);
});

test('getTapDrillSize snaps a non-grid exact diameter to the nearest standard drill size (1/4 UNC)', () => {
  const result = getTapDrillSize('imperial', '1/4');
  assert.equal(result.tpi, 20);
  assert.equal(result.exactDrillDiameter, 5.11);
  assert.equal(result.standardDrillDiameter, 5.1);
});

test('getTapDrillSize works for UNF (imperial fine)', () => {
  const result = getTapDrillSize('imperial', '1/4', { fine: true });
  assert.equal(result.tpi, 28);
  assert.equal(result.exactDrillDiameter, 5.41);
  assert.equal(result.standardDrillDiameter, 5.4);
});

test('getTapDrillSize throws when the metric size has no fine option', () => {
  assert.throws(() => getTapDrillSize('metric', 'M3', { fine: true }));
});

test('getTapDrillSize throws on an unknown nominal size', () => {
  assert.throws(() => getTapDrillSize('metric', 'M7'));
});

test('getTapDrillSize throws on an unknown system', () => {
  assert.throws(() => getTapDrillSize('bogus', 'M6'));
});

test('hasFineOption is false below M6 and true from M6 up', () => {
  assert.equal(hasFineOption('metric', 'M5'), false);
  assert.equal(hasFineOption('metric', 'M6'), true);
  assert.equal(hasFineOption('metric', 'M24'), true);
});

test('hasFineOption is true for every imperial size (all have a UNF variant)', () => {
  for (const size of getNominalSizes('imperial')) {
    assert.equal(hasFineOption('imperial', size), true, `${size} should have a UNF option`);
  }
});

test('hasFineOption throws on an unknown nominal size', () => {
  assert.throws(() => hasFineOption('metric', 'M7'));
});

test('every metric and imperial entry resolves to a drill diameter within the tool\'s supported range (1-32mm)', () => {
  for (const system of TAP_DRILL_SYSTEMS) {
    for (const size of getNominalSizes(system)) {
      const coarse = getTapDrillSize(system, size);
      assert.ok(
        coarse.standardDrillDiameter >= 1 && coarse.standardDrillDiameter <= 32,
        `${system} ${size} coarse out of range: ${coarse.standardDrillDiameter}`
      );
      if (hasFineOption(system, size)) {
        const fine = getTapDrillSize(system, size, { fine: true });
        assert.ok(
          fine.standardDrillDiameter >= 1 && fine.standardDrillDiameter <= 32,
          `${system} ${size} fine out of range: ${fine.standardDrillDiameter}`
        );
      }
    }
  }
});
