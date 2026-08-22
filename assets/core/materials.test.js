import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getFeedBand,
  computeVc,
  computeResultForMaterial,
  computeAllResults,
  DRILL_MATERIALS
} from './materials.js';

test('getFeedBand returns the 3-6mm band for 3.7mm', () => {
  assert.deepEqual(getFeedBand(3.7), { dmax: 6, fmin: 0.05, fmax: 0.10, def: 0.075 });
});

test('getFeedBand returns the 6-10mm band for 8mm', () => {
  assert.deepEqual(getFeedBand(8), { dmax: 10, fmin: 0.10, fmax: 0.15, def: 0.125 });
});

test('computeVc applies the alloy bias within each drill material range', () => {
  assert.equal(computeVc('hss', '6061'), 51);
  assert.equal(computeVc('carbide', '6061'), 255);
  assert.equal(computeVc('coated', '6061'), 305);
});

test('computeResultForMaterial matches hand-verified values for 8mm 6061 HSS', () => {
  assert.deepEqual(computeResultForMaterial(8, '6061', 'hss'), {
    drillMat: 'hss',
    drillMatLabel: '高速鋼 HSS',
    vc: 51,
    f: 0.125,
    rpm: 2029,
    feedRate: 254
  });
});

test('computeResultForMaterial matches hand-verified values for 8mm 6061 carbide', () => {
  const result = computeResultForMaterial(8, '6061', 'carbide');
  assert.equal(result.vc, 255);
  assert.equal(result.rpm, 10146);
  assert.equal(result.feedRate, 1268);
});

test('computeResultForMaterial matches hand-verified values for 8mm 6061 coated carbide', () => {
  const result = computeResultForMaterial(8, '6061', 'coated');
  assert.equal(result.vc, 305);
  assert.equal(result.rpm, 12136);
  assert.equal(result.feedRate, 1517);
});

test('computeAllResults normalizes the diameter and returns one result per drill material, in order', () => {
  const { diameter, results } = computeAllResults(3.672, '6061');
  assert.equal(diameter, 3.7);
  assert.equal(results.length, DRILL_MATERIALS.length);
  assert.deepEqual(results.map((r) => r.drillMat), ['hss', 'carbide', 'coated']);
  assert.equal(results[0].rpm, 4388);
  assert.equal(results[1].rpm, 21938);
  assert.equal(results[2].rpm, 26239);
});
