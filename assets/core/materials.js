import { nearestStandardDiameter } from './diameter.js';

export const FEED_BANDS = [
  { dmax: 3, fmin: 0.03, fmax: 0.06, def: 0.045 },
  { dmax: 6, fmin: 0.05, fmax: 0.10, def: 0.075 },
  { dmax: 10, fmin: 0.10, fmax: 0.15, def: 0.125 },
  { dmax: 15, fmin: 0.15, fmax: 0.25, def: 0.20 },
  { dmax: 20, fmin: 0.20, fmax: 0.30, def: 0.25 },
  { dmax: Infinity, fmin: 0.25, fmax: 0.35, def: 0.30 }
];

export function getFeedBand(diameter) {
  for (const band of FEED_BANDS) {
    if (diameter <= band.dmax) return band;
  }
  return FEED_BANDS[FEED_BANDS.length - 1];
}

export const DRILL_MATERIALS = [
  { key: 'hss', label: '高速鋼 HSS', vcMin: 30, vcMax: 60 },
  { key: 'carbide', label: '硬質合金', vcMin: 150, vcMax: 300 },
  { key: 'coated', label: '塗層硬質合金', vcMin: 200, vcMax: 350 }
];

export const ALLOY_BIAS = { '6061': 0.7, '7075': 0.5, a380: 0.35, custom: 0.5 };
export const ALLOY_LABELS = {
  '6061': '6061',
  '7075': '7075',
  a380: 'A380 壓鑄鋁',
  custom: '自訂鋁合金'
};

function getDrillMaterial(drillMatKey) {
  const found = DRILL_MATERIALS.find((m) => m.key === drillMatKey);
  if (!found) throw new Error(`Unknown drill material: ${drillMatKey}`);
  return found;
}

export function computeVc(drillMatKey, alloyKey) {
  const material = getDrillMaterial(drillMatKey);
  const bias = ALLOY_BIAS[alloyKey];
  if (bias === undefined) throw new Error(`Unknown alloy: ${alloyKey}`);
  return Math.round(material.vcMin + bias * (material.vcMax - material.vcMin));
}

export function computeResultForMaterial(diameter, alloyKey, drillMatKey) {
  const material = getDrillMaterial(drillMatKey);
  const vc = computeVc(drillMatKey, alloyKey);
  const band = getFeedBand(diameter);
  const f = band.def;
  const n = (1000 * vc) / (Math.PI * diameter);
  const feedRate = n * f;
  return {
    drillMat: material.key,
    drillMatLabel: material.label,
    vc,
    f,
    rpm: Math.round(n),
    feedRate: Math.round(feedRate)
  };
}

export function computeAllResults(rawDiameter, alloyKey) {
  const diameter = nearestStandardDiameter(rawDiameter);
  const results = DRILL_MATERIALS.map((m) => computeResultForMaterial(diameter, alloyKey, m.key));
  return { diameter, results };
}
