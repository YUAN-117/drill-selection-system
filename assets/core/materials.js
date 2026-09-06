import { nearestStandardDiameter } from './diameter.js';

export const DRILL_TOOL_TYPES = ['hss', 'carbide', 'coated'];

export const DRILL_TOOL_LABELS = {
  hss: '高速鋼 HSS',
  carbide: '硬質合金',
  coated: '塗層硬質合金'
};

export const WORKPIECE_MATERIALS = {
  aluminum: {
    label: '鋁合金',
    subtypes: {
      '6061': { label: '6061', bias: 0.7 },
      '7075': { label: '7075', bias: 0.5 },
      a380: { label: 'A380 壓鑄鋁', bias: 0.35 },
      custom: { label: '自訂鋁合金', bias: 0.5 }
    },
    drillVc: {
      hss: { min: 30, max: 60 },
      carbide: { min: 150, max: 300 },
      coated: { min: 200, max: 350 }
    },
    feedBands: [
      { dmax: 3, fmin: 0.03, fmax: 0.06, def: 0.045 },
      { dmax: 6, fmin: 0.05, fmax: 0.10, def: 0.075 },
      { dmax: 10, fmin: 0.10, fmax: 0.15, def: 0.125 },
      { dmax: 15, fmin: 0.15, fmax: 0.25, def: 0.20 },
      { dmax: 20, fmin: 0.20, fmax: 0.30, def: 0.25 },
      { dmax: Infinity, fmin: 0.25, fmax: 0.35, def: 0.30 }
    ],
    caveat: '一般用途或單件加工可選高速鋼 HSS;長時間量產或需拉高轉速可選硬質合金 / 塗層硬質合金。'
  },
  copper: {
    label: '銅合金',
    subtypes: { brass: { label: '黃銅', bias: 0.5 } },
    drillVc: {
      hss: { min: 50, max: 80 },
      carbide: { min: 60, max: 200 },
      coated: { min: 80, max: 250, lowConfidence: true }
    },
    feedBands: [{ dmax: Infinity, fmin: 0.10, fmax: 0.25, def: 0.175 }],
    caveat: '黃銅屬自由切削材料,排屑良好,一般不易咬刀;塗層硬質合金數值為推估參考,無直接來源數據。'
  },
  stainless: {
    label: '不鏽鋼',
    subtypes: { standard: { label: '不鏽鋼(304/316 通用)', bias: 0.5 } },
    drillVc: {
      hss: { min: 8, max: 15 },
      carbide: { min: 30, max: 50 },
      coated: { min: 40, max: 70, lowConfidence: true }
    },
    feedBands: [
      { dmax: 6, fmin: 0.10, fmax: 0.15, def: 0.125 },
      { dmax: 15, fmin: 0.15, fmax: 0.22, def: 0.185 },
      { dmax: Infinity, fmin: 0.20, fmax: 0.30, def: 0.25 }
    ],
    caveat: '進給量不可過低,過低會使表面加工硬化、可能咬死鑽頭;鑽孔中途不可暫停進給,深孔建議搭配內冷卻。'
  },
  peek: {
    label: 'PEEK',
    subtypes: { standard: { label: 'PEEK(通用)', bias: 0.5 } },
    drillVc: {
      hss: { min: 30, max: 120 },
      carbide: { min: 30, max: 120 },
      coated: { min: 30, max: 120 }
    },
    feedBands: [{ dmax: Infinity, fmin: 0.08, fmax: 0.20, def: 0.14 }],
    caveat: '工程塑膠主要受熱影響(易因悶熱軟化/積屑),鑽頭材質對速度影響較小;深孔建議降低轉速並分段退屑。'
  },
  pc: {
    label: 'PC 聚碳酸酯',
    subtypes: { standard: { label: 'PC(通用)', bias: 0.5 } },
    drillVc: {
      hss: { min: 15, max: 30 },
      carbide: { min: 15, max: 30 },
      coated: { min: 15, max: 30 }
    },
    feedBands: [
      { dmax: 6, fmin: 0.18, fmax: 0.38, def: 0.28 },
      { dmax: 15, fmin: 0.38, fmax: 0.64, def: 0.51 },
      { dmax: Infinity, fmin: 0.51, fmax: 1.27, def: 0.89 }
    ],
    caveat: '工程塑膠主要受熱影響,鑽頭材質對速度影響較小;易因悶熱產生應力裂紋,鑽頭需保持銳利,接近穿透時建議減速。'
  },
  pom: {
    label: 'POM / Delrin',
    subtypes: { standard: { label: 'POM(通用)', bias: 0.5 } },
    drillVc: {
      hss: { min: 60, max: 100 },
      carbide: { min: 60, max: 100 },
      coated: { min: 60, max: 100 }
    },
    feedBands: [{ dmax: Infinity, fmin: 0.10, fmax: 0.20, def: 0.15 }],
    caveat: '工程塑膠主要受熱影響,鑽頭材質對速度影響較小;穿透時建議維持進給速度(不要放慢),避免鑽頭咬料造成孔口撕裂。'
  }
};

function getMaterial(materialKey) {
  const material = WORKPIECE_MATERIALS[materialKey];
  if (!material) throw new Error(`Unknown material: ${materialKey}`);
  return material;
}

function getSubtype(materialKey, subtypeKey) {
  const material = getMaterial(materialKey);
  const subtype = material.subtypes[subtypeKey];
  if (!subtype) throw new Error(`Unknown subtype: ${materialKey}:${subtypeKey}`);
  return subtype;
}

export function computeVc(materialKey, subtypeKey, drillToolType) {
  const material = getMaterial(materialKey);
  const subtype = getSubtype(materialKey, subtypeKey);
  const range = material.drillVc[drillToolType];
  if (!range) throw new Error(`Unknown drill tool type: ${drillToolType}`);
  const vc = Math.round(range.min + subtype.bias * (range.max - range.min));
  return { vc, lowConfidence: Boolean(range.lowConfidence) };
}

export function getFeedBand(diameter, materialKey) {
  const material = getMaterial(materialKey);
  for (const band of material.feedBands) {
    if (diameter <= band.dmax) return band;
  }
  return material.feedBands[material.feedBands.length - 1];
}

export function computeResult(rawDiameter, materialKey, subtypeKey, drillToolType) {
  const diameter = nearestStandardDiameter(rawDiameter);
  const { vc, lowConfidence } = computeVc(materialKey, subtypeKey, drillToolType);
  const band = getFeedBand(diameter, materialKey);
  const f = band.def;
  const n = (1000 * vc) / (Math.PI * diameter);
  const feedRate = n * f;
  return {
    diameter,
    drillMat: drillToolType,
    drillMatLabel: DRILL_TOOL_LABELS[drillToolType],
    vc,
    f,
    rpm: Math.round(n),
    feedRate: Math.round(feedRate),
    lowConfidence,
    caveat: getMaterial(materialKey).caveat
  };
}
