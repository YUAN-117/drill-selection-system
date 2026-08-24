# 多材料鑽頭選擇 — 核心計算與畫面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the aluminum-only calculation model with a multi-material one (鋁合金/銅合金/不鏽鋼/PEEK/PC/POM), let the user pick a single 鑽頭材質(HSS/硬質合金/塗層硬質合金)instead of seeing all three compared side by side, and update history storage/display to match.

**Architecture:** `assets/core/materials.js` becomes the single source of truth for a new `WORKPIECE_MATERIALS` data structure — each workpiece material owns its own complete set of drill-tool Vc ranges and feed bands (no more sharing one aluminum-shaped range across materials). `assets/ui/toolView.js` gains pure render functions for the new `<optgroup>` material select and the dynamically-labeled drill-material select; `assets/ui/toolController.js` wires them together and now recomputes a single result instead of three. `assets/data/historyStore.js` and `assets/ui/historyView.js` follow the same shape change (one result per record, not three).

**Tech Stack:** Same as the rest of the project — plain ES modules, no build step, Node's built-in test runner for `core/`, `data/`, and `ui/*View.js`; `ui/*Controller.js` is DOM-touching and verified manually in a browser, matching existing project convention.

**Spec:** [docs/superpowers/specs/2026-08-24-multi-material-drill-selection-design.md](../specs/2026-08-24-multi-material-drill-selection-design.md)

**Depends on:** nothing — this plan is fully self-contained and produces a working tool on its own. The companion plan `2026-08-24-multi-material-voice.md` (AI 語音輸入的材料辨識擴充) depends on this one being done first, since it reuses the same material key list.

## Global Constraints

- 六大工件材料類別:`aluminum`(鋁合金,4 子項:6061/7075/a380/custom)、`copper`(銅合金,1 子項:brass/黃銅)、`stainless`(不鏽鋼,1 子項:standard)、`peek`(PEEK,1 子項:standard)、`pc`(PC 聚碳酸酯,1 子項:standard)、`pom`(POM/Delrin,1 子項:standard)。這次**不加**青銅、鐵氟龍(PTFE),**不細分**不鏽鋼/銅合金的多個子項。
- 三種鑽頭材質固定順序:`hss`、`carbide`、`coated`,每個工件材料**各自**定義完整的 `{min, max}` Vc 範圍(不再共用同一組範圍去內插)。
- Vc 內插公式不變:`vc = Math.round(min + bias * (max - min))`。只有一個子項的材料,`bias` 固定 `0.5`。
- 進給量依直徑分段,分段規則(`{dmax, fmin, fmax, def}` 陣列)**依材料而異**,不再是全域共用的一份表。資料不夠支撐多段的材料,用單一段 `{dmax: Infinity, ...}` 涵蓋所有直徑。
- 識別字命名從「alloy」全面改成「material」——`materialEl`、`materialKey`、`materialLabel` 等,不留舊的 `alloy` 命名。
- 畫面上鑽頭材質選單的三個選項,文字要包含隨目前工件材料變動的建議 Vc 範圍,例如「高速鋼 HSS(建議 30–60 m/min)」。
- 結果顯示改成單一列(不再三種材質並排比較),`lowConfidence: true` 的數值要在畫面上標示「⚠ 推估參考」,每個材料的 `caveat` 提醒文字動態顯示在結果下方。
- `core/`、`data/` 與 `ui/*View.js` 維持純函式、不碰 `document`,用 Node 單元測試涵蓋;`ui/*Controller.js` 是唯一碰 DOM 的地方,手動瀏覽器驗證,不寫自動化測試。
- 這次**不做**:語音輸入辨識鑽頭材質(維持手動選,語音填完直徑/材料後鑽頭材質欄位不變)、既有(舊格式)歷史紀錄的資料轉換。

---

### Task 1: `core/materials.js` — 多材料資料結構與計算邏輯

**Files:**
- Modify: `assets/core/materials.js`(整份重寫)
- Modify: `assets/core/materials.test.js`(整份重寫)

**Interfaces:**
- Produces: `DRILL_TOOL_TYPES` (`['hss','carbide','coated']`)、`DRILL_TOOL_LABELS` (`{hss,carbide,coated} -> string`)、`WORKPIECE_MATERIALS` (物件,見下方完整資料)、`computeVc(materialKey, subtypeKey, drillToolType): {vc: number, lowConfidence: boolean}`、`getFeedBand(diameter, materialKey): {dmax, fmin, fmax, def}`、`computeResult(rawDiameter, materialKey, subtypeKey, drillToolType): {diameter, drillMat, drillMatLabel, vc, f, rpm, feedRate, lowConfidence, caveat}`
- Consumes: `nearestStandardDiameter` from `./diameter.js`(不變)

- [ ] **Step 1: Write the failing tests**

Create `assets/core/materials.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKPIECE_MATERIALS,
  DRILL_TOOL_TYPES,
  computeVc,
  getFeedBand,
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
  const result = computeResult(8.05, 'aluminum', '6061', 'hss');
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — the new exports (`WORKPIECE_MATERIALS`, `DRILL_TOOL_TYPES`, `computeVc` with the new signature, etc.) don't exist yet in `materials.js`.

- [ ] **Step 3: Write the implementation**

Replace the entire content of `assets/core/materials.js` with:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS. (This will also break `assets/ui/toolView.js`, `toolController.js`, `assets/data/historyStore.js`, `assets/ui/historyView.js` and their tests, since they still import the old `DRILL_MATERIALS`/`ALLOY_BIAS`/`ALLOY_LABELS`/`computeAllResults` — that's expected, Tasks 2–6 fix them. For this step, only confirm `materials.test.js` itself passes; the other test files failing is expected and will be fixed in later tasks.)

- [ ] **Step 5: Commit**

```bash
git add assets/core/materials.js assets/core/materials.test.js
git commit -m "feat: replace aluminum-only Vc model with per-material data for 6 workpiece materials"
```

---

### Task 2: `ui/toolView.js` — 多材料下拉選單與單一結果渲染

**Files:**
- Modify: `assets/ui/toolView.js`(整份重寫)
- Modify: `assets/ui/toolView.test.js`(整份重寫)

**Interfaces:**
- Consumes: `WORKPIECE_MATERIALS`, `DRILL_TOOL_TYPES`, `DRILL_TOOL_LABELS`, `computeResult` (Task 1)
- Produces: `EMPTY_RESULT_ROW` (string)、`GUIDANCE_DEFAULT_TEXT` (string)、`renderMaterialOptionsHtml(): string`、`renderDrillMatOptionsHtml(materialKey: string): string`、`renderResultRow(result, materialKey): string`、`renderGuidanceHtml(materialKey): string`、`renderDiameterHint(rawDiameter, normalizedDiameter): string`(不變,沿用既有邏輯)

- [ ] **Step 1: Write the failing tests**

Create `assets/ui/toolView.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeResult } from '../core/materials.js';
import {
  renderMaterialOptionsHtml,
  renderDrillMatOptionsHtml,
  renderResultRow,
  renderGuidanceHtml,
  renderDiameterHint
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
  assert.ok(row.includes(String(result.rpm)));
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `toolView.js` still exports the old `renderCompareRows`/`vcRangeLabel`-based functions, not these new ones.

- [ ] **Step 3: Write the implementation**

Replace the entire content of `assets/ui/toolView.js` with:

```js
import { formatNumber } from '../core/format.js';
import { WORKPIECE_MATERIALS, DRILL_TOOL_TYPES, DRILL_TOOL_LABELS } from '../core/materials.js';

export const EMPTY_RESULT_ROW =
  '<tr><td colspan="6" style="color: var(--readout-text-dim); padding: 20px 14px;">輸入直徑後顯示結果</td></tr>';

export const GUIDANCE_DEFAULT_TEXT = '選擇材料材質並輸入直徑後,顯示選用原則';

export function renderMaterialOptionsHtml() {
  return Object.entries(WORKPIECE_MATERIALS)
    .map(([materialKey, material]) => {
      const subtypeEntries = Object.entries(material.subtypes);
      if (subtypeEntries.length > 1) {
        const options = subtypeEntries
          .map(
            ([subtypeKey, subtype]) =>
              '<option value="' + materialKey + ':' + subtypeKey + '">' + subtype.label + '</option>'
          )
          .join('');
        return '<optgroup label="' + material.label + '">' + options + '</optgroup>';
      }
      const [subtypeKey, subtype] = subtypeEntries[0];
      return '<option value="' + materialKey + ':' + subtypeKey + '">' + subtype.label + '</option>';
    })
    .join('');
}

export function renderDrillMatOptionsHtml(materialKey) {
  const material = WORKPIECE_MATERIALS[materialKey];
  return DRILL_TOOL_TYPES.map((type) => {
    const range = material.drillVc[type];
    return (
      '<option value="' + type + '">' + DRILL_TOOL_LABELS[type] + '(建議 ' + range.min + '–' + range.max + ' m/min)</option>'
    );
  }).join('');
}

export function renderResultRow(result, materialKey) {
  const range = WORKPIECE_MATERIALS[materialKey].drillVc[result.drillMat];
  const confidenceNote = result.lowConfidence ? ' ⚠ 推估參考' : '';
  return (
    '<tr>' +
    '<td class="mat-name">' + result.drillMatLabel + confidenceNote + '</td>' +
    '<td>' + range.min + '–' + range.max + ' m/min</td>' +
    '<td>' + formatNumber(result.vc, 0) + ' m/min</td>' +
    '<td class="rpm-cell">' + formatNumber(result.rpm, 0) + '</td>' +
    '<td>' + formatNumber(result.f, 3) + ' mm/rev</td>' +
    '<td class="feed-cell">' + formatNumber(result.feedRate, 0) + ' mm/min</td>' +
    '</tr>'
  );
}

export function renderGuidanceHtml(materialKey) {
  return WORKPIECE_MATERIALS[materialKey].caveat;
}

export function renderDiameterHint(rawDiameter, normalizedDiameter) {
  if (Math.abs(rawDiameter - normalizedDiameter) < 0.001) {
    return '✓ 市售標準鑽頭尺寸';
  }
  return '⚙ ' + rawDiameter + 'mm 非市售規格,已對應到最接近的 <strong>' + normalizedDiameter + ' mm</strong> 計算';
}
```

Note: `renderMaterialOptionsHtml` for single-subtype materials uses `subtype.label` (e.g. `不鏽鋼(304/316 通用)`), not `material.label` (`不鏽鋼`) — the subtype label is already fully descriptive for these materials, matching how aluminum's subtype labels (`6061`, `7075`, ...) work without needing the category name repeated.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS for `toolView.test.js` and `materials.test.js`. `toolController.test.js` doesn't exist (Controller files aren't unit tested), but `historyStore.test.js`/`historyView.test.js` will still be failing at this point — expected, fixed in Tasks 5–6.

- [ ] **Step 5: Commit**

```bash
git add assets/ui/toolView.js assets/ui/toolView.test.js
git commit -m "feat: render multi-material select and single-result row instead of 3-way compare table"
```

---

### Task 3: `tool.html` — 材料材質/鑽頭材質選單標記

**Files:**
- Modify: `tool.html`

**Interfaces:**
- Produces: DOM elements `#material` (empty `<select>`, populated by Task 4's controller) and `#drillMat` (empty `<select>`, same) for Task 4 to wire up.

- [ ] **Step 1: 修改 `tool.html`**

In `tool.html`, find the `<div class="field-grid">` block (currently contains the `#diameter` field and the `#alloy` select) and replace the `#alloy` field with two new fields (`#material` replacing it, plus a new `#drillMat`):

Replace:
```html
      <div class="field">
        <label for="alloy">鋁合金材質</label>
        <select id="alloy">
          <option value="6061">6061</option>
          <option value="7075">7075</option>
          <option value="a380">A380 壓鑄鋁</option>
          <option value="custom">自訂鋁合金</option>
        </select>
      </div>
```

With:
```html
      <div class="field">
        <label for="material">材料材質</label>
        <select id="material"></select>
      </div>
      <div class="field">
        <label for="drillMat">鑽頭材質</label>
        <select id="drillMat"></select>
      </div>
```

(Both selects start empty — `assets/ui/toolController.js`, built in Task 4, populates them at page load using `renderMaterialOptionsHtml()` / `renderDrillMatOptionsHtml()` from Task 2, the same way `#drillSizeList` is already populated by JS today.)

Also update the page description paragraph and the footer note to match the new multi-material scope. Replace:

```html
    <p>輸入鑽頭直徑與鋁合金材質,自動比較三種鑽頭材質的建議轉速與進給量</p>
```

With:
```html
    <p>輸入鑽頭直徑、材料材質與鑽頭材質,計算建議轉速與進給量</p>
```

And replace the footer note:
```html
    直徑僅接受市售鑽頭常見規格(1.0–13.0mm 每 0.1mm、13.5–20.0mm 每 0.5mm、21–32mm 每 1mm,依 DIN 338 麻花鑽常見尺寸系列),輸入非標準值會自動對應到最接近的規格。Vc、f 為經驗常用範圍,非精確固定值,進給量僅依直徑分段,不因鑽頭材質而異。實際仍應依刀具廠商規格與機台狀況微調。目前不考慮孔深/深徑比、貫穿孔或沉頭孔。記錄僅保存在本機瀏覽器(localStorage)。
```

With:
```html
    直徑僅接受市售鑽頭常見規格(1.0–13.0mm 每 0.1mm、13.5–20.0mm 每 0.5mm、21–32mm 每 1mm,依 DIN 338 麻花鑽常見尺寸系列),輸入非標準值會自動對應到最接近的規格。Vc、f 為經驗常用範圍,非精確固定值,標示「⚠ 推估參考」的數值信心度較低,實際仍應依刀具廠商規格與機台狀況微調。進給量依直徑與材料材質分段,鑽頭材質(HSS/硬質合金/塗層硬質合金)只影響建議轉速範圍,不影響進給量。目前不考慮孔深/深徑比、貫穿孔或沉頭孔。記錄僅保存在本機瀏覽器(localStorage)。
```

The `<table class="compare-table">` header row and `#compareBody` `<tbody>` block stay exactly as they are — the 6 columns (鑽頭材質/Vc 常用範圍/採用 Vc/RPM/進給量 f/進給速度) already match what Task 2's `renderResultRow` produces, only the JS logic filling them changes (Task 4).

- [ ] **Step 2: 手動確認畫面(選單此時還是空的,Task 4 才會接上邏輯)**

在瀏覽器打開 `tool.html`,確認畫面上「材料材質」跟「鑽頭材質」兩個下拉選單都出現(內容目前是空的,這是預期的,Task 4 完成後才會填入選項),版面沒有跑版(三個欄位:直徑、材料材質、鑽頭材質應該並排或自動換行,取決於畫面寬度)。

- [ ] **Step 3: Commit**

```bash
git add tool.html
git commit -m "feat: replace alloy select with material + drill-material selects in tool.html"
```

---

### Task 4: `ui/toolController.js` — 串接多材料選單與單一結果計算

**Files:**
- Modify: `assets/ui/toolController.js`(整份重寫)

**Interfaces:**
- Consumes: `computeResult`, `DRILL_TOOL_TYPES` (Task 1); `EMPTY_RESULT_ROW`, `GUIDANCE_DEFAULT_TEXT`, `renderMaterialOptionsHtml`, `renderDrillMatOptionsHtml`, `renderResultRow`, `renderGuidanceHtml`, `renderDiameterHint` (Task 2); `addHistoryRecord` (Task 5 — signature defined here, implemented in Task 5); DOM elements `#material`, `#drillMat` (Task 3)
- Produces: nothing consumed by later tasks (this is the top of the wiring chain for `tool.html`) — but Task 5's `addHistoryRecord` call signature is fixed here: `addHistoryRecord(localStorage, diameter, materialKey, subtypeKey, drillToolType, result)`

This file touches `document`/`localStorage` — not unit tested, verified manually (Task 7), same as before this change.

- [ ] **Step 1: Write the implementation**

Replace the entire content of `assets/ui/toolController.js` with:

```js
import { STANDARD_SIZES, nearestStandardDiameter } from '../core/diameter.js';
import { computeResult, DRILL_TOOL_TYPES } from '../core/materials.js';
import { addHistoryRecord } from '../data/historyStore.js';
import {
  EMPTY_RESULT_ROW,
  GUIDANCE_DEFAULT_TEXT,
  renderMaterialOptionsHtml,
  renderDrillMatOptionsHtml,
  renderResultRow,
  renderGuidanceHtml,
  renderDiameterHint
} from './toolView.js';

const diameterEl = document.getElementById('diameter');
const materialEl = document.getElementById('material');
const drillMatEl = document.getElementById('drillMat');
const compareBody = document.getElementById('compareBody');
const diaHint = document.getElementById('diaHint');
const guidanceLine = document.getElementById('guidanceLine');
const addBtn = document.getElementById('addBtn');

let currentComputation = null;

function parseMaterialValue(value) {
  const [materialKey, subtypeKey] = value.split(':');
  return { materialKey, subtypeKey };
}

function renderEmpty() {
  compareBody.innerHTML = EMPTY_RESULT_ROW;
  diaHint.innerHTML = '&nbsp;';
  guidanceLine.textContent = GUIDANCE_DEFAULT_TEXT;
  addBtn.disabled = true;
  currentComputation = null;
}

function refreshDrillMatOptions(materialKey) {
  const previousValue = drillMatEl.value;
  drillMatEl.innerHTML = renderDrillMatOptionsHtml(materialKey);
  if (DRILL_TOOL_TYPES.includes(previousValue)) {
    drillMatEl.value = previousValue;
  }
}

function renderResults(rawDiameter, materialKey, subtypeKey, drillToolType) {
  const result = computeResult(rawDiameter, materialKey, subtypeKey, drillToolType);
  diaHint.innerHTML = renderDiameterHint(rawDiameter, result.diameter);
  compareBody.innerHTML = renderResultRow(result, materialKey);
  guidanceLine.innerHTML = renderGuidanceHtml(materialKey);
  addBtn.disabled = false;
  currentComputation = { diameter: result.diameter, materialKey, subtypeKey, drillToolType, result };
}

function recompute() {
  const raw = parseFloat(diameterEl.value);
  if (!raw || raw <= 0) {
    renderEmpty();
    return;
  }
  const { materialKey, subtypeKey } = parseMaterialValue(materialEl.value);
  renderResults(raw, materialKey, subtypeKey, drillMatEl.value);
}

diameterEl.addEventListener('input', recompute);
diameterEl.addEventListener('blur', () => {
  const raw = parseFloat(diameterEl.value);
  if (raw > 0) diameterEl.value = nearestStandardDiameter(raw);
});
materialEl.addEventListener('change', () => {
  const { materialKey } = parseMaterialValue(materialEl.value);
  refreshDrillMatOptions(materialKey);
  recompute();
});
drillMatEl.addEventListener('change', recompute);

addBtn.addEventListener('click', () => {
  if (!currentComputation) return;
  const { diameter, materialKey, subtypeKey, drillToolType, result } = currentComputation;
  addHistoryRecord(localStorage, diameter, materialKey, subtypeKey, drillToolType, result);
  addBtn.textContent = '已加入 ✓';
  setTimeout(() => {
    addBtn.textContent = '加入記錄';
  }, 1200);
});

(function populateDatalist() {
  const list = document.getElementById('drillSizeList');
  const frag = document.createDocumentFragment();
  STANDARD_SIZES.forEach((size) => {
    const opt = document.createElement('option');
    opt.value = size;
    frag.appendChild(opt);
  });
  list.appendChild(frag);
})();

materialEl.innerHTML = renderMaterialOptionsHtml();
refreshDrillMatOptions(parseMaterialValue(materialEl.value).materialKey);
renderEmpty();
```

- [ ] **Step 2: 手動確認畫面**

在瀏覽器打開 `tool.html`,確認:
- 「材料材質」選單載入後有內容,鋁合金底下可以看到 6061/7075/A380 壓鑄鋁/自訂鋁合金 4 個選項,其他材料(銅合金、不鏽鋼、PEEK、PC、POM)各自一個選項
- 「鑽頭材質」選單有 3 個選項,文字後面帶著建議 Vc 範圍
- 切換「材料材質」為「不鏽鋼」,確認「鑽頭材質」選單裡的建議範圍文字跟著變成不鏽鋼的數字(例如高速鋼 HSS 變成「建議 8–15 m/min」)
- 輸入直徑(例如 8),確認下方結果列出現數字,不再是三行

- [ ] **Step 3: Commit**

```bash
git add assets/ui/toolController.js
git commit -m "feat: wire multi-material selects and single-result recompute in tool.html"
```

---

### Task 5: `data/historyStore.js` — 新歷史紀錄格式(單一結果)

**Files:**
- Modify: `assets/data/historyStore.js`(整份重寫)
- Modify: `assets/data/historyStore.test.js`(整份重寫)

**Interfaces:**
- Consumes: `WORKPIECE_MATERIALS` (Task 1)
- Produces: `HISTORY_STORAGE_KEY` (不變)、`loadHistory(storage)` (不變)、`addHistoryRecord(storage, diameter, materialKey, subtypeKey, drillToolType, result): Array`(簽名改變,回傳的紀錄物件形狀:`{id, timestamp, diameter, materialKey, subtypeKey, materialLabel, drillMat, drillMatLabel, result}`)、`deleteHistoryRecord`/`clearHistory`(不變)

- [ ] **Step 1: Write the failing tests**

Replace the entire content of `assets/data/historyStore.test.js` with:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeResult } from '../core/materials.js';
import {
  HISTORY_STORAGE_KEY,
  loadHistory,
  addHistoryRecord,
  deleteHistoryRecord,
  clearHistory
} from './historyStore.js';

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, value)
  };
}

test('loadHistory returns an empty array when nothing is stored', () => {
  assert.deepEqual(loadHistory(createMemoryStorage()), []);
});

test('loadHistory returns an empty array when the stored value is not valid JSON', () => {
  const storage = createMemoryStorage();
  storage.setItem(HISTORY_STORAGE_KEY, 'not json');
  assert.deepEqual(loadHistory(storage), []);
});

test('addHistoryRecord stores diameter, material label, drill material, and the result', () => {
  const storage = createMemoryStorage();
  const result = computeResult(8, 'aluminum', '6061', 'hss');
  const list = addHistoryRecord(storage, 8, 'aluminum', '6061', 'hss', result);
  assert.equal(list.length, 1);
  assert.equal(list[0].diameter, 8);
  assert.equal(list[0].materialKey, 'aluminum');
  assert.equal(list[0].subtypeKey, '6061');
  assert.equal(list[0].materialLabel, '6061');
  assert.equal(list[0].drillMat, 'hss');
  assert.equal(list[0].drillMatLabel, '高速鋼 HSS');
  assert.equal(list[0].result.rpm, result.rpm);
  assert.ok(list[0].id);
  assert.ok(list[0].timestamp);
});

test('addHistoryRecord works for a single-subtype material like stainless', () => {
  const storage = createMemoryStorage();
  const result = computeResult(8, 'stainless', 'standard', 'carbide');
  const list = addHistoryRecord(storage, 8, 'stainless', 'standard', 'carbide', result);
  assert.equal(list[0].materialLabel, '不鏽鋼(304/316 通用)');
});

test('addHistoryRecord puts the newest record first', () => {
  const storage = createMemoryStorage();
  const r1 = computeResult(8, 'aluminum', '6061', 'hss');
  const r2 = computeResult(10, 'aluminum', '7075', 'carbide');
  addHistoryRecord(storage, 8, 'aluminum', '6061', 'hss', r1);
  addHistoryRecord(storage, 10, 'aluminum', '7075', 'carbide', r2);
  const list = loadHistory(storage);
  assert.equal(list[0].diameter, 10);
  assert.equal(list[1].diameter, 8);
});

test('deleteHistoryRecord removes only the matching record', () => {
  const storage = createMemoryStorage();
  const r1 = computeResult(8, 'aluminum', '6061', 'hss');
  addHistoryRecord(storage, 8, 'aluminum', '6061', 'hss', r1);
  const [{ id }] = loadHistory(storage);
  const r2 = computeResult(10, 'aluminum', '7075', 'carbide');
  addHistoryRecord(storage, 10, 'aluminum', '7075', 'carbide', r2);
  const remaining = deleteHistoryRecord(storage, id);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].diameter, 10);
});

test('clearHistory empties the stored list', () => {
  const storage = createMemoryStorage();
  const result = computeResult(8, 'aluminum', '6061', 'hss');
  addHistoryRecord(storage, 8, 'aluminum', '6061', 'hss', result);
  clearHistory(storage);
  assert.deepEqual(loadHistory(storage), []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `addHistoryRecord` still has the old 4-argument signature and stores `results`/`alloyLabel`, not the new shape.

- [ ] **Step 3: Write the implementation**

Replace the entire content of `assets/data/historyStore.js` with:

```js
import { WORKPIECE_MATERIALS } from '../core/materials.js';

export const HISTORY_STORAGE_KEY = 'drillSelectionHistory_v1';

export function loadHistory(storage) {
  try {
    const raw = storage.getItem(HISTORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveHistory(storage, list) {
  try {
    storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore quota errors / unavailable storage (e.g. Safari private browsing).
  }
}

function makeRecordId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export function addHistoryRecord(storage, diameter, materialKey, subtypeKey, drillToolType, result) {
  const list = loadHistory(storage);
  const subtype = WORKPIECE_MATERIALS[materialKey].subtypes[subtypeKey];
  list.unshift({
    id: makeRecordId(),
    timestamp: new Date().toISOString(),
    diameter,
    materialKey,
    subtypeKey,
    materialLabel: subtype.label,
    drillMat: drillToolType,
    drillMatLabel: result.drillMatLabel,
    result
  });
  saveHistory(storage, list);
  return list;
}

export function deleteHistoryRecord(storage, id) {
  const list = loadHistory(storage).filter((record) => record.id !== id);
  saveHistory(storage, list);
  return list;
}

export function clearHistory(storage) {
  saveHistory(storage, []);
  return [];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS for `historyStore.test.js`, `materials.test.js`, `toolView.test.js`. `historyView.test.js` still failing — expected, fixed in Task 6.

- [ ] **Step 5: Commit**

```bash
git add assets/data/historyStore.js assets/data/historyStore.test.js
git commit -m "feat: store a single material/drill-material/result per history record"
```

---

### Task 6: `ui/historyView.js` — 顯示新格式的歷史紀錄

**Files:**
- Modify: `assets/ui/historyView.js`(整份重寫)
- Modify: `assets/ui/historyView.test.js`(整份重寫)

**Interfaces:**
- Consumes: `computeResult` (Task 1, used only in tests to build a realistic record fixture); record shape from Task 5 (`{diameter, materialLabel, drillMatLabel, result: {rpm, f, feedRate, lowConfidence}, ...}`)
- Produces: `EMPTY_STATE_HTML` (不變)、`renderHistoryRecord(record): string`、`renderHistoryList(list): string`(不變簽名,內容跟著新格式調整)

- [ ] **Step 1: Write the failing tests**

Replace the entire content of `assets/ui/historyView.test.js` with:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeResult } from '../core/materials.js';
import { EMPTY_STATE_HTML, renderHistoryRecord, renderHistoryList } from './historyView.js';

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
  assert.ok(html.includes(String(record.result.rpm)));
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `renderHistoryRecord` still reads `record.alloyLabel`/`record.results` (an array), which no longer exist on the new record shape.

- [ ] **Step 3: Write the implementation**

Replace the entire content of `assets/ui/historyView.js` with:

```js
import { formatNumber } from '../core/format.js';

export const EMPTY_STATE_HTML =
  '<div class="empty-state">尚無記錄,到「鑽頭選擇」頁計算後按「加入記錄」即可保存於此</div>';

export function renderHistoryRecord(record) {
  const time = new Date(record.timestamp).toLocaleString('zh-TW');
  const confidenceNote = record.result.lowConfidence ? ' ⚠ 推估參考' : '';
  return (
    '<div class="history-record">' +
    '<div class="record-head">' +
    '<span class="record-title">' + record.diameter + 'mm · ' + record.materialLabel + '</span>' +
    '<span class="record-time">' + time + '</span>' +
    '<button class="del-btn btn-ghost" data-id="' + record.id + '">刪除</button>' +
    '</div>' +
    '<table><thead><tr><th>鑽頭材質</th><th>轉速</th><th>進給量</th></tr></thead><tbody>' +
    '<tr>' +
    '<td>' + record.drillMatLabel + confidenceNote + '</td>' +
    '<td>' + formatNumber(record.result.rpm, 0) + ' RPM</td>' +
    '<td>' + formatNumber(record.result.f, 3) + ' mm/rev · ' + formatNumber(record.result.feedRate, 0) + ' mm/min</td>' +
    '</tr>' +
    '</tbody></table>' +
    '</div>'
  );
}

export function renderHistoryList(list) {
  const validRecords = list.filter((record) => record.result);
  if (validRecords.length === 0) return EMPTY_STATE_HTML;
  return validRecords.map(renderHistoryRecord).join('');
}
```

`renderHistoryList` filters out any record missing the new `result` field before rendering — this is the "不做轉換,讀到舊格式紀錄時不噴錯、略過該筆" behavior the spec calls for: old-format records (from before this change, shaped `{alloyLabel, results: [...]}`) silently disappear from the history list instead of crashing the page. No migration, no special-casing inside `renderHistoryRecord` itself — it can assume every record it receives already has the new shape.

Note: `assets/ui/historyController.js` and `history.html` need **no changes** — `historyController.js` only calls `loadHistory`/`deleteHistoryRecord`/`clearHistory`/`renderHistoryList` generically and never reaches into a record's fields directly, so the new record shape flows through it untouched.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all tests in the repo green (materials, diameter, format, historyStore, historyView, toolView).

- [ ] **Step 5: Commit**

```bash
git add assets/ui/historyView.js assets/ui/historyView.test.js
git commit -m "feat: render single-material history records instead of 3-row breakdown"
```

---

### Task 7: 手動端對端驗證

**Files:** none — manual browser verification, matching this project's established pattern for DOM-touching code.

- [ ] **Step 1: 基本流程**

打開 `tool.html`(需要跑本機靜態伺服器,例如 `npx serve`,不能用 `file://`)。確認:
- 「材料材質」選單載入時有 6 大類、鋁合金底下 4 個子項
- 選「鋁合金 → 6061」、鑽頭材質選「高速鋼 HSS」、直徑輸入 8,結果列出現一行(不是三行),數字合理(RPM 應該跟舊版鋁合金 6061 + HSS 的結果一致,可以跟 git 歷史裡舊版的畫面截圖比對——RPM 應為 51 m/min 對應的轉速,跟先前這個功能上線時測試過的數字相同)

- [ ] **Step 2: 切換材料,確認鑽頭材質選單的建議範圍動態更新**

材料材質切成「不鏽鋼」,確認鑽頭材質選單裡三個選項後面的建議範圍變成不鏽鋼的數字(高速鋼 HSS 變成「建議 8–15 m/min」),且原本選的「高速鋼 HSS」還是維持選中(不會因為選單重新渲染就跳回第一個選項)。

- [ ] **Step 3: 逐一測試六種材料**

材料材質依序切過鋁合金、銅合金(黃銅)、不鏽鋼、PEEK、PC、POM,每種都輸入直徑 8,三種鑽頭材質都點一次,確認:
- 每次都能算出結果,沒有 JS 錯誤(打開 DevTools Console 確認)
- 不鏽鋼的塗層硬質合金、銅合金的塗層硬質合金,結果列出現「⚠ 推估參考」;其他組合不會出現
- 下方提醒文字(`guidanceLine`)隨材料換一段對應的說明文字

- [ ] **Step 4: 加入歷史紀錄並確認顯示**

任選一組(例如 PC + 硬質合金),按「加入記錄」,切到 `history.html`,確認新紀錄顯示「8mm · PC(通用)」、鑽頭材質、轉速、進給量都正確,刪除按鈕也正常運作。

- [ ] **Step 5: 確認語音輸入的舊行為(還沒串接新材質前)**

因為這個計畫還沒更新語音輸入(下一份計畫 `2026-08-24-multi-material-voice.md` 才會做),先確認語音輸入目前呼叫失敗時的行為合理——語音填入的 `#material` 值目前應該還是舊格式的裸鍵值(例如 `"6061"`),跟新版 `#material` 選單需要的 `"aluminum:6061"` 格式不符,語音填入後可能導致 `parseMaterialValue` 解析出不存在的材料而報錯。**這是預期中的暫時性不一致**,下一份計畫的 Task 4 會修正,這裡先確認手動選單操作完全正常即可,不用糾結語音輸入這條路徑。
