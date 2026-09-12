# 深孔鑽提醒 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增選填的「孔深」欄位,深徑比(孔深 ÷ 鑽頭直徑)達到 3 倍時顯示深孔警告文字,不調整 Vc/RPM 計算結果,警告資訊一併存進歷史紀錄。

**Architecture:** 在既有的 `computeResult` 加一個選填的 `depth` 參數,向下相容(不傳就完全跟現在行為一致)。新增一個純函式 `getDeepHoleWarning` 判斷深徑比並回傳警告文字或 `null`。`tool.html` 新增孔深輸入欄跟警告顯示區塊,`toolController.js`/`historyStore.js`/`historyView.js` 依序把這個新欄位串起來。

**Tech Stack:** 同專案既有:plain ES modules,無 build step,Node 內建 test runner 測 `core/`、`data/`、`ui/*View.js`,`ui/*Controller.js` 手動瀏覽器驗證。

**Spec:** [docs/superpowers/specs/2026-09-12-deep-hole-drilling-design.md](../specs/2026-09-12-deep-hole-drilling-design.md)

**Depends on:** 無,這份計畫自成一體,完成後就是可用的功能。

## Global Constraints

- 深徑比門檻:孔深 ÷ (套用 `nearestStandardDiameter` 後的)最終鑽頭直徑 **≥ 3** 才觸發警告,低於 3 不觸發。
- **不調整 Vc/RPM/進給量的計算結果**——深孔只加一段文字提醒,既有計算欄位完全不受影響。
- **不給具體退屑次數/間隔數字**——只給原則性文字(分段進給、適時退屑、不可中途長時間停頓進給)。
- `depth` 一律選填,不傳(`undefined`)或使用者沒填(空字串/非正數)都視同沒有深孔資訊,`deepHoleWarning` 回傳 `null`,既有呼叫端與既有測試完全不用改就能繼續通過。
- 歷史紀錄要存 `depth`(沒有是 `null`)跟 `deepHoleWarning`(沒觸發是 `null`)。
- `core/`、`data/` 與 `ui/*View.js` 維持純函式、不碰 `document`,用 Node 單元測試涵蓋;`ui/*Controller.js` 是唯一碰 DOM 的地方,手動瀏覽器驗證,不寫自動化測試。

---

### Task 1: `core/materials.js` — 深孔判斷邏輯

**Files:**
- Modify: `assets/core/materials.js`
- Modify: `assets/core/materials.test.js`

**Interfaces:**
- Produces: `getDeepHoleWarning(depth, diameter): string | null`、`computeResult(rawDiameter, materialKey, subtypeKey, drillToolType, depth?)` 回傳物件新增 `depth`(`number | null`)、`deepHoleWarning`(`string | null`)兩個欄位,其餘既有欄位不變

- [ ] **Step 1: Write the failing tests**

在 `assets/core/materials.test.js` 裡,找到這一行 import:

```js
import {
  WORKPIECE_MATERIALS,
  DRILL_TOOL_TYPES,
  computeVc,
  getFeedBand,
  computeResult
} from './materials.js';
```

Replace with:

```js
import {
  WORKPIECE_MATERIALS,
  DRILL_TOOL_TYPES,
  computeVc,
  getFeedBand,
  getDeepHoleWarning,
  computeResult
} from './materials.js';
```

然後在檔案最後(`every workpiece material defines all three drill tool Vc ranges...` 這個 test 的結尾 `});` 之後)加上:

```js

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `getDeepHoleWarning` doesn't exist yet, `computeResult` doesn't return `depth`/`deepHoleWarning`.

- [ ] **Step 3: Write the implementation**

在 `assets/core/materials.js` 裡,找到:

```js
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

Replace with:

```js
export function getFeedBand(diameter, materialKey) {
  const material = getMaterial(materialKey);
  for (const band of material.feedBands) {
    if (diameter <= band.dmax) return band;
  }
  return material.feedBands[material.feedBands.length - 1];
}

export function getDeepHoleWarning(depth, diameter) {
  if (depth == null) return null;
  const ratio = depth / diameter;
  if (ratio < 3) return null;
  return `⚠ 深孔(深徑比約 ${ratio.toFixed(1)} 倍),建議分段進給並適時退屑排屑,避免鑽頭崩刃或孔壁刮傷;鑽孔中途不可長時間停頓進給。`;
}

export function computeResult(rawDiameter, materialKey, subtypeKey, drillToolType, depth) {
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
    caveat: getMaterial(materialKey).caveat,
    depth: depth ?? null,
    deepHoleWarning: getDeepHoleWarning(depth, diameter)
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS for `materials.test.js`. All other existing test files remain passing (this task doesn't change any existing function's behavior when `depth` is omitted).

- [ ] **Step 5: Commit**

```bash
git add assets/core/materials.js assets/core/materials.test.js
git commit -m "feat: add depth-to-diameter deep-hole warning to computeResult"
```

---

### Task 2: `ui/toolView.js` — 深孔警告渲染

**Files:**
- Modify: `assets/ui/toolView.js`
- Modify: `assets/ui/toolView.test.js`

**Interfaces:**
- Produces: `renderDeepHoleWarningHtml(deepHoleWarning: string | null): string`(有警告就回傳警告文字,沒有就回傳空字串)

- [ ] **Step 1: Write the failing tests**

在 `assets/ui/toolView.test.js` 裡,找到這一段 import:

```js
import {
  renderMaterialOptionsHtml,
  renderDrillMatOptionsHtml,
  renderResultRow,
  renderGuidanceHtml,
  renderDiameterHint
} from './toolView.js';
```

Replace with:

```js
import {
  renderMaterialOptionsHtml,
  renderDrillMatOptionsHtml,
  renderResultRow,
  renderGuidanceHtml,
  renderDiameterHint,
  renderDeepHoleWarningHtml
} from './toolView.js';
```

然後在檔案最後加上:

```js

test('renderDeepHoleWarningHtml returns the warning text when provided', () => {
  assert.equal(renderDeepHoleWarningHtml('⚠ 深孔警告文字'), '⚠ 深孔警告文字');
});

test('renderDeepHoleWarningHtml returns an empty string when there is no warning', () => {
  assert.equal(renderDeepHoleWarningHtml(null), '');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `renderDeepHoleWarningHtml` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

在 `assets/ui/toolView.js` 裡,找到檔案最後一個函式:

```js
export function renderDiameterHint(rawDiameter, normalizedDiameter) {
  if (Math.abs(rawDiameter - normalizedDiameter) < 0.001) {
    return '✓ 市售標準鑽頭尺寸';
  }
  return '⚙ ' + rawDiameter + 'mm 非市售規格,已對應到最接近的 <strong>' + normalizedDiameter + ' mm</strong> 計算';
}
```

Replace with(保留原函式,後面加新函式):

```js
export function renderDiameterHint(rawDiameter, normalizedDiameter) {
  if (Math.abs(rawDiameter - normalizedDiameter) < 0.001) {
    return '✓ 市售標準鑽頭尺寸';
  }
  return '⚙ ' + rawDiameter + 'mm 非市售規格,已對應到最接近的 <strong>' + normalizedDiameter + ' mm</strong> 計算';
}

export function renderDeepHoleWarningHtml(deepHoleWarning) {
  return deepHoleWarning || '';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS for `toolView.test.js` and `materials.test.js`. All other existing test files remain passing.

- [ ] **Step 5: Commit**

```bash
git add assets/ui/toolView.js assets/ui/toolView.test.js
git commit -m "feat: render the deep-hole warning text"
```

---

### Task 3: `tool.html` + `assets/style.css` — 孔深欄位與警告區塊標記

**Files:**
- Modify: `tool.html`
- Modify: `assets/style.css`

**Interfaces:**
- Produces: DOM elements `#depth`(選填的孔深輸入框)、`#deepHoleWarning`(警告顯示區塊,預設 `hidden`),供 Task 4 使用

- [ ] **Step 1: 在 `tool.html` 新增孔深輸入欄**

找到:

```html
      <div class="field">
        <label for="drillMat">鑽頭材質</label>
        <select id="drillMat"></select>
      </div>
    </div>
```

Replace with:

```html
      <div class="field">
        <label for="drillMat">鑽頭材質</label>
        <select id="drillMat"></select>
      </div>
      <div class="field">
        <label for="depth">孔深 (mm,選填)</label>
        <input type="number" id="depth" min="0" step="0.5" placeholder="不填則不判斷深孔">
      </div>
    </div>
```

- [ ] **Step 2: 在 `tool.html` 新增深孔警告區塊**

找到:

```html
    <div class="params-line" id="guidanceLine">選擇材質並輸入直徑後,顯示選用原則</div>
```

Replace with:

```html
    <div class="params-line" id="guidanceLine">選擇材質並輸入直徑後,顯示選用原則</div>
    <div class="params-line deep-hole-warning" id="deepHoleWarning" hidden></div>
```

- [ ] **Step 3: 更新 `tool.html` 頁尾說明文字**

找到:

```html
    直徑僅接受市售鑽頭常見規格(1.0–13.0mm 每 0.1mm、13.5–20.0mm 每 0.5mm、21–32mm 每 1mm,依 DIN 338 麻花鑽常見尺寸系列),輸入非標準值會自動對應到最接近的規格。Vc、f 為經驗常用範圍,非精確固定值,標示「⚠ 推估參考」的數值信心度較低,實際仍應依刀具廠商規格與機台狀況微調。進給量依直徑與材料材質分段,鑽頭材質(HSS/硬質合金/塗層硬質合金)只影響建議轉速範圍,不影響進給量。目前不考慮孔深/深徑比、貫穿孔或沉頭孔。記錄僅保存在本機瀏覽器(localStorage)。
```

Replace with:

```html
    直徑僅接受市售鑽頭常見規格(1.0–13.0mm 每 0.1mm、13.5–20.0mm 每 0.5mm、21–32mm 每 1mm,依 DIN 338 麻花鑽常見尺寸系列),輸入非標準值會自動對應到最接近的規格。Vc、f 為經驗常用範圍,非精確固定值,標示「⚠ 推估參考」的數值信心度較低,實際仍應依刀具廠商規格與機台狀況微調。進給量依直徑與材料材質分段,鑽頭材質(HSS/硬質合金/塗層硬質合金)只影響建議轉速範圍,不影響進給量。孔深為選填欄位,深徑比達 3 倍以上會顯示深孔提醒,但不影響 Vc/RPM 計算結果。目前不考慮貫穿孔或沉頭孔。記錄僅保存在本機瀏覽器(localStorage)。
```

- [ ] **Step 4: 在 `assets/style.css` 新增深孔警告樣式**

找到:

```css
.params-line strong {
  font-family: "IBM Plex Mono", monospace;
  color: var(--accent-strong);
  font-weight: 600;
}
```

Replace with:

```css
.params-line strong {
  font-family: "IBM Plex Mono", monospace;
  color: var(--accent-strong);
  font-weight: 600;
}

.params-line.deep-hole-warning {
  color: var(--danger);
  border-top-color: var(--danger-soft);
}
```

- [ ] **Step 5: 手動確認畫面(欄位此時還沒接上邏輯,Task 4 才會)**

在瀏覽器打開 `tool.html`,確認「鑽頭直徑/材料材質/鑽頭材質/孔深」四欄並排(或視畫面寬度自動換行),孔深欄位空著且可以輸入數字,畫面沒有跑版,深孔警告區塊目前不可見(因為 `hidden` 屬性)。

- [ ] **Step 6: Commit**

```bash
git add tool.html assets/style.css
git commit -m "feat: add depth field and deep-hole warning markup to tool.html"
```

---

### Task 4: `ui/toolController.js` — 串接孔深輸入與警告顯示

**Files:**
- Modify: `assets/ui/toolController.js`(整份重寫)

**Interfaces:**
- Consumes: `computeResult`(Task 1,新增選填的 `depth` 參數)、`renderDeepHoleWarningHtml`(Task 2)、DOM elements `#depth`、`#deepHoleWarning`(Task 3)
- Produces: `addHistoryRecord` 呼叫多傳一個 `depth` 參數(簽名在此定義,Task 5 實作)

這個檔案碰 `document`,不寫自動化測試,手動瀏覽器驗證(Task 7)。

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
  renderDiameterHint,
  renderDeepHoleWarningHtml
} from './toolView.js';

const diameterEl = document.getElementById('diameter');
const materialEl = document.getElementById('material');
const drillMatEl = document.getElementById('drillMat');
const depthEl = document.getElementById('depth');
const compareBody = document.getElementById('compareBody');
const diaHint = document.getElementById('diaHint');
const guidanceLine = document.getElementById('guidanceLine');
const deepHoleWarningEl = document.getElementById('deepHoleWarning');
const addBtn = document.getElementById('addBtn');

let currentComputation = null;

function parseMaterialValue(value) {
  const [materialKey, subtypeKey] = value.split(':');
  return { materialKey, subtypeKey };
}

function parseDepthValue() {
  const raw = parseFloat(depthEl.value);
  return raw > 0 ? raw : undefined;
}

function renderEmpty() {
  compareBody.innerHTML = EMPTY_RESULT_ROW;
  diaHint.innerHTML = '&nbsp;';
  guidanceLine.textContent = GUIDANCE_DEFAULT_TEXT;
  deepHoleWarningEl.hidden = true;
  deepHoleWarningEl.textContent = '';
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

function renderResults(rawDiameter, materialKey, subtypeKey, drillToolType, depth) {
  const result = computeResult(rawDiameter, materialKey, subtypeKey, drillToolType, depth);
  diaHint.innerHTML = renderDiameterHint(rawDiameter, result.diameter);
  compareBody.innerHTML = renderResultRow(result, materialKey);
  guidanceLine.innerHTML = renderGuidanceHtml(materialKey);
  const warningText = renderDeepHoleWarningHtml(result.deepHoleWarning);
  deepHoleWarningEl.textContent = warningText;
  deepHoleWarningEl.hidden = !warningText;
  addBtn.disabled = false;
  currentComputation = { diameter: result.diameter, materialKey, subtypeKey, drillToolType, depth: result.depth, result };
}

function recompute() {
  const raw = parseFloat(diameterEl.value);
  if (!raw || raw <= 0) {
    renderEmpty();
    return;
  }
  const { materialKey, subtypeKey } = parseMaterialValue(materialEl.value);
  renderResults(raw, materialKey, subtypeKey, drillMatEl.value, parseDepthValue());
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
depthEl.addEventListener('input', recompute);

addBtn.addEventListener('click', () => {
  if (!currentComputation) return;
  const { diameter, materialKey, subtypeKey, drillToolType, depth, result } = currentComputation;
  addHistoryRecord(localStorage, diameter, materialKey, subtypeKey, drillToolType, result, depth);
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
- 選好材料材質、鑽頭材質,輸入直徑 8,結果正常顯示(跟深孔功能上線前一致)
- 孔深留空,結果照常顯示,深孔警告區塊不出現
- 孔深輸入 10(深徑比 1.25 倍),深孔警告區塊仍不出現
- 孔深輸入 24(深徑比剛好 3 倍),深孔警告區塊出現,文字提到「深孔」跟「3.0 倍」,Vc/RPM/進給量數字跟孔深留空時完全一樣
- 把孔深清空,深孔警告區塊立刻消失

- [ ] **Step 3: Commit**

```bash
git add assets/ui/toolController.js
git commit -m "feat: wire depth input and deep-hole warning display in tool.html"
```

---

### Task 5: `data/historyStore.js` — 歷史紀錄存孔深與警告

**Files:**
- Modify: `assets/data/historyStore.js`
- Modify: `assets/data/historyStore.test.js`

**Interfaces:**
- Produces: `addHistoryRecord(storage, diameter, materialKey, subtypeKey, drillToolType, result, depth?)`(簽名多一個選填參數),儲存的紀錄物件新增 `depth`(`number | null`)、`deepHoleWarning`(`string | null`)兩個欄位

- [ ] **Step 1: Write the failing tests**

在 `assets/data/historyStore.test.js` 檔案最後(`clearHistory empties the stored list` 這個 test 的結尾 `});` 之後)加上:

```js

test('addHistoryRecord stores depth as null when not provided (backward compatible)', () => {
  const storage = createMemoryStorage();
  const result = computeResult(8, 'aluminum', '6061', 'hss');
  const list = addHistoryRecord(storage, 8, 'aluminum', '6061', 'hss', result);
  assert.equal(list[0].depth, null);
  assert.equal(list[0].deepHoleWarning, null);
});

test('addHistoryRecord stores the depth and deep-hole warning when provided', () => {
  const storage = createMemoryStorage();
  const result = computeResult(8, 'aluminum', '6061', 'hss', 40);
  const list = addHistoryRecord(storage, 8, 'aluminum', '6061', 'hss', result, 40);
  assert.equal(list[0].depth, 40);
  assert.ok(list[0].deepHoleWarning);
  assert.ok(list[0].deepHoleWarning.includes('深孔'));
});

test('addHistoryRecord stores a shallow depth without a deep-hole warning', () => {
  const storage = createMemoryStorage();
  const result = computeResult(8, 'aluminum', '6061', 'hss', 10);
  const list = addHistoryRecord(storage, 8, 'aluminum', '6061', 'hss', result, 10);
  assert.equal(list[0].depth, 10);
  assert.equal(list[0].deepHoleWarning, null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `addHistoryRecord` 還不會存 `depth`/`deepHoleWarning`。

- [ ] **Step 3: Write the implementation**

在 `assets/data/historyStore.js` 裡,找到:

```js
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
```

Replace with:

```js
export function addHistoryRecord(storage, diameter, materialKey, subtypeKey, drillToolType, result, depth) {
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
    depth: depth ?? null,
    deepHoleWarning: result.deepHoleWarning ?? null,
    result
  });
  saveHistory(storage, list);
  return list;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS for `historyStore.test.js`. All other existing test files remain passing.

- [ ] **Step 5: Commit**

```bash
git add assets/data/historyStore.js assets/data/historyStore.test.js
git commit -m "feat: store depth and deep-hole warning in history records"
```

---

### Task 6: `ui/historyView.js` — 顯示孔深與深孔警告

**Files:**
- Modify: `assets/ui/historyView.js`
- Modify: `assets/ui/historyView.test.js`
- Modify: `assets/style.css`

**Interfaces:**
- Consumes: record shape from Task 5(`{depth, deepHoleWarning, ...}`)
- Produces: `renderHistoryRecord(record)` 標題在有 `depth` 時多顯示孔深,有 `deepHoleWarning` 時額外顯示警告文字行(簽名不變)

- [ ] **Step 1: Write the failing tests**

在 `assets/ui/historyView.test.js` 檔案最後(`renderHistoryList renders multiple records joined together` 這個 test 的結尾 `});` 之後)加上:

```js

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `renderHistoryRecord` 還不會顯示孔深或深孔警告。

- [ ] **Step 3: Write the implementation**

在 `assets/ui/historyView.js` 裡,找到:

```js
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
```

Replace with:

```js
export function renderHistoryRecord(record) {
  const time = new Date(record.timestamp).toLocaleString('zh-TW');
  const confidenceNote = record.result.lowConfidence ? ' ⚠ 推估參考' : '';
  const depthNote = record.depth ? '(孔深 ' + record.depth + 'mm)' : '';
  const deepHoleWarningLine = record.deepHoleWarning
    ? '<div class="record-deep-hole-warning">' + record.deepHoleWarning + '</div>'
    : '';
  return (
    '<div class="history-record">' +
    '<div class="record-head">' +
    '<span class="record-title">' + record.diameter + 'mm' + depthNote + ' · ' + record.materialLabel + '</span>' +
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
    deepHoleWarningLine +
    '</div>'
  );
}
```

- [ ] **Step 4: 在 `assets/style.css` 新增歷史紀錄的深孔警告樣式**

找到:

```css
.history-record td {
  padding: 8px 16px;
  font-family: "IBM Plex Mono", monospace;
  font-variant-numeric: tabular-nums;
  border-top: 1px solid var(--border);
}
```

Replace with:

```css
.history-record td {
  padding: 8px 16px;
  font-family: "IBM Plex Mono", monospace;
  font-variant-numeric: tabular-nums;
  border-top: 1px solid var(--border);
}

.history-record .record-deep-hole-warning {
  padding: 8px 16px 12px;
  font-size: 12px;
  color: var(--danger);
  border-top: 1px dashed var(--border);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all tests in the repo green.

- [ ] **Step 6: Commit**

```bash
git add assets/ui/historyView.js assets/ui/historyView.test.js assets/style.css
git commit -m "feat: display depth and deep-hole warning in history records"
```

---

### Task 7: 手動端對端驗證

**Files:** none — manual browser verification, matching this project's established pattern for DOM-touching code.

- [ ] **Step 1: 基本流程(孔深留空,既有行為不受影響)**

打開 `tool.html`(需要跑本機靜態伺服器,例如 `npx serve`,不能用 `file://`)。選鋁合金 6061 + HSS,輸入直徑 8,孔深留空,確認結果列跟深孔功能上線前完全一樣(RPM 應為 2,029),深孔警告區塊不出現。

- [ ] **Step 2: 深孔門檻邊界測試**

孔深依序輸入 10(深徑比 1.25)、23(深徑比 2.875)、24(深徑比 3.0)、40(深徑比 5.0),確認前兩個不觸發警告,後兩個觸發,警告文字裡的深徑比數字正確(3.0 倍、5.0 倍),且不管孔深填多少,RPM/Vc/進給量數字都維持 2,029/51/254 不變。

- [ ] **Step 3: 加入歷史紀錄並確認顯示**

孔深填 40,加入記錄,切到 `history.html`,確認新紀錄標題顯示「8mm(孔深 40mm)· 6061」,底下有深孔警告文字。再计算一筆孔深留空的記錄加入,確認標題只顯示「8mm · 6061」,沒有警告文字,新舊格式的紀錄可以同時正常顯示,刪除按鈕也正常運作。

- [ ] **Step 4: 確認全部測試通過**

執行 `npm test`,確認全部測試(包含這次新增的)都通過,沒有破壞任何既有功能。
