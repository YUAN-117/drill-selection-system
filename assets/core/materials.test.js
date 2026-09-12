import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKPIECE_MATERIALS,
  DRILL_TOOL_TYPES,
  computeVc,
  getFeedBand,
  getDeepHoleWarning,
  computeResult
} from './materials.js';

test('computeVc interpolates aluminum 6061 within the HSS range using its bias', () => {
  const { vc, lowConfidence } = computeVc('aluminum', '6061', 'hss');
  assert.equal(vc, Math.round(30 + 0.7 * (60 - 30)));
  assert.equal(lowConfidence, false);
});

test('computeVc uses the range midpoint for single-subtype materials', () => {
  const { vc } = computeVc('stainless', 'standard', 'hss');
  assert.equal(vc, Math.round((8 + 15) / 2));
});

test('computeVc flags lowConfidence for stainless coated carbide', () => {
  const { lowConfidence } = computeVc('stainless', 'standard', 'coated');
  assert.equal(lowConfidence, true);
});

test('computeVc flags lowConfidence for copper coated carbide', () => {
  const { lowConfidence } = computeVc('copper', 'brass', 'coated');
  assert.equal(lowConfidence, true);
});

test('computeVc does not flag lowConfidence for a normal aluminum result', () => {
  const { lowConfidence } = computeVc('aluminum', '7075', 'carbide');
  assert.equal(lowConfidence, false);
});

test('computeVc throws on an unknown material', () => {
  assert.throws(() => computeVc('titanium', 'x', 'hss'));
});

test('computeVc throws on an unknown subtype', () => {
  assert.throws(() => computeVc('aluminum', 'unknown', 'hss'));
});

test('getFeedBand picks the aluminum band matching the diameter (existing behavior preserved)', () => {
  assert.equal(getFeedBand(8, 'aluminum').def, 0.125);
  assert.equal(getFeedBand(2, 'aluminum').def, 0.045);
});

test('getFeedBand returns the single band for materials with only one tier', () => {
  assert.equal(getFeedBand(2, 'peek').def, 0.14);
  assert.equal(getFeedBand(30, 'peek').def, 0.14);
});

test('getFeedBand picks the right stainless band by diameter', () => {
  assert.equal(getFeedBand(4, 'stainless').def, 0.125);
  assert.equal(getFeedBand(10, 'stainless').def, 0.185);
  assert.equal(getFeedBand(25, 'stainless').def, 0.25);
});

test('getFeedBand picks the right PC band by diameter', () => {
  assert.equal(getFeedBand(4, 'pc').def, 0.28);
  assert.equal(getFeedBand(10, 'pc').def, 0.51);
  assert.equal(getFeedBand(25, 'pc').def, 0.89);
});

test('computeResult returns rpm, feed, and a material-specific caveat for aluminum', () => {
  const result = computeResult(8, 'aluminum', '6061', 'hss');
  assert.equal(result.diameter, 8);
  assert.equal(result.drillMat, 'hss');
  assert.equal(result.drillMatLabel, '高速鋼 HSS');
  assert.ok(result.rpm > 0);
  assert.ok(result.feedRate > 0);
  assert.equal(result.lowConfidence, false);
  assert.ok(result.caveat.includes('高速鋼'));
});

test('computeResult flags lowConfidence when the selected drill type is a low-confidence estimate', () => {
  const result = computeResult(8, 'stainless', 'standard', 'coated');
  assert.equal(result.lowConfidence, true);
});

test('computeResult snaps the raw diameter to the nearest standard size', () => {
  const result = computeResult(8.04, 'aluminum', '6061', 'hss');
  assert.equal(result.diameter, 8);
});

test('computeResult works for every workpiece material and drill tool type combination', () => {
  for (const materialKey of Object.keys(WORKPIECE_MATERIALS)) {
    const [subtypeKey] = Object.keys(WORKPIECE_MATERIALS[materialKey].subtypes);
    for (const drillToolType of DRILL_TOOL_TYPES) {
      const result = computeResult(8, materialKey, subtypeKey, drillToolType);
      assert.ok(result.rpm > 0, `${materialKey}/${subtypeKey}/${drillToolType} rpm should be positive`);
      assert.ok(result.feedRate > 0, `${materialKey}/${subtypeKey}/${drillToolType} feedRate should be positive`);
    }
  }
});

test('DRILL_TOOL_TYPES lists exactly the three drill materials in a fixed order', () => {
  assert.deepEqual(DRILL_TOOL_TYPES, ['hss', 'carbide', 'coated']);
});

test('every workpiece material defines all three drill tool Vc ranges, at least one subtype, and at least one feed band', () => {
  for (const [key, material] of Object.entries(WORKPIECE_MATERIALS)) {
    for (const type of DRILL_TOOL_TYPES) {
      assert.ok(material.drillVc[type], `${key} missing drillVc.${type}`);
    }
    assert.ok(Object.keys(material.subtypes).length >= 1, `${key} has no subtypes`);
    assert.ok(material.feedBands.length >= 1, `${key} has no feed bands`);
    assert.ok(typeof material.caveat === 'string' && material.caveat.length > 0, `${key} has no caveat text`);
  }
});

test('getDeepHoleWarning returns null when depth is not provided', () => {
  assert.equal(getDeepHoleWarning(undefined, 8), null);
  assert.equal(getDeepHoleWarning(null, 8), null);
});

test('getDeepHoleWarning returns null when the depth-to-diameter ratio is below 3', () => {
  assert.equal(getDeepHoleWarning(23, 8), null);
});

test('getDeepHoleWarning triggers exactly at a 3x depth-to-diameter ratio and includes the ratio', () => {
  const warning = getDeepHoleWarning(24, 8);
  assert.ok(warning);
  assert.ok(warning.includes('深孔'));
  assert.ok(warning.includes('3.0'));
});

test('getDeepHoleWarning triggers for a clearly deep hole and includes the computed ratio', () => {
  const warning = getDeepHoleWarning(40, 8);
  assert.ok(warning.includes('5.0'));
});

test('computeResult without a depth argument behaves exactly as before (backward compatible)', () => {
  const result = computeResult(8, 'aluminum', '6061', 'hss');
  assert.equal(result.depth, null);
  assert.equal(result.deepHoleWarning, null);
});

test('computeResult with a shallow depth does not trigger a deep-hole warning', () => {
  const result = computeResult(8, 'aluminum', '6061', 'hss', 10);
  assert.equal(result.depth, 10);
  assert.equal(result.deepHoleWarning, null);
});

test('computeResult with a deep depth triggers a deep-hole warning without changing rpm/vc/feed', () => {
  const shallow = computeResult(8, 'aluminum', '6061', 'hss');
  const deep = computeResult(8, 'aluminum', '6061', 'hss', 40);
  assert.equal(deep.depth, 40);
  assert.ok(deep.deepHoleWarning);
  assert.equal(deep.rpm, shallow.rpm);
  assert.equal(deep.vc, shallow.vc);
  assert.equal(deep.feedRate, shallow.feedRate);
});
