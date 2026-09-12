# 攻牙底孔查詢 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在鑽頭選擇系統新增一個獨立的「攻牙底孔查詢」區塊,使用者選公制/英制規格,直接查出建議攻牙底孔直徑,不用先搞懂粗牙/細牙術語。

**Architecture:** 延續專案既有的三層分離慣例(純邏輯 / 純渲染 / DOM 控制)。新增 `assets/core/tapDrill.js`(標準攻牙底孔對照表 + 查詢函式,純函式有測試)、`assets/ui/tapDrillView.js`(渲染函式,有測試)、`assets/ui/tapDrillController.js`(DOM 操作,手動驗證),邏輯上完全獨立於現有的 `toolController.js`,不共用任何 state。

**Tech Stack:** 同專案既有:plain ES modules,無 build step,Node 內建 test runner 測 `core/` 與 `ui/*View.js`,`ui/*Controller.js` 手動瀏覽器驗證。

**Spec:** [docs/superpowers/specs/2026-09-12-tap-drill-size-design.md](../specs/2026-09-12-tap-drill-size-design.md)

**Depends on:** 無,這份計畫自成一體,完成後就是可用的功能。

## Global Constraints

- 支援規格:公制 15 個(M2、M2.5、M3、M4、M5、M6、M8、M10、M12、M14、M16、M18、M20、M22、M24)、英制 15 個(#4、#6、#8、#10、#12、1/4、5/16、3/8、7/16、1/2、9/16、5/8、3/4、7/8、1)。
- **不因材料調整底孔直徑**——統一查標準表。
- **不整合進歷史紀錄**——純查詢功能,查完即完成。
- 底孔直徑計算基礎是業界標準「75% 牙深嚙合」,已於 spec 撰寫階段透過研究 agent 查證並交叉比對多個獨立來源(見下方各 Task 的資料表),不是憑印象填的數字。
- 每個公制/英制規格**最多一個細牙/UNF 選項**(不做「同一直徑多個細牙螺距」的次級選單)——這是根據查證結果做的簡化,信心度較低的次要細牙選項(例如 M8×0.75、M12×1.25)不收錄,只收錄業界最常用的主要選項。這跟 spec 文件原本設想的「`#tapFineOptions` 次級選單」不同,是更簡單的版本:一個核取方塊「這顆是細牙?」就能切換,規格沒有細牙選項時核取方塊直接 disable。
- 查出來的底孔直徑一律套用既有 `assets/core/diameter.js` 的 `nearestStandardDiameter`,對應到這個工具既有的市售標準鑽頭尺寸列表(1.0–32mm),不重造這段邏輯。
- `core/` 與 `ui/*View.js` 維持純函式、不碰 `document`,用 Node 單元測試涵蓋;`ui/*Controller.js` 是唯一碰 DOM 的地方,手動瀏覽器驗證,不寫自動化測試。

---

### Task 1: `core/tapDrill.js` — 標準攻牙底孔資料與查詢邏輯

**Files:**
- Create: `assets/core/tapDrill.js`
- Create: `assets/core/tapDrill.test.js`

**Interfaces:**
- Produces: `TAP_DRILL_SYSTEMS`(`['metric', 'imperial']`)、`METRIC_THREADS`、`IMPERIAL_THREADS`(資料物件)、`getNominalSizes(system): string[]`、`hasFineOption(system, nominalSize): boolean`、`getTapDrillSize(system, nominalSize, { fine }): { system, nominalSize, isFine, pitch, tpi, exactDrillDiameter, standardDrillDiameter }`
- Consumes: `nearestStandardDiameter` from `./diameter.js`(不變)

- [ ] **Step 1: Write the failing tests**

Create `assets/core/tapDrill.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `tapDrill.js` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `assets/core/tapDrill.js`:

```js
import { nearestStandardDiameter } from './diameter.js';

export const TAP_DRILL_SYSTEMS = ['metric', 'imperial'];

// 資料來源：ISO 262 / ISO 965 公制螺紋螺距與 75% 牙深嚙合攻牙底孔對照表，
// 查證時交叉比對 Wikipedia (ISO metric screw thread)、AmesWeb 公制攻牙計算機、
// get-it-made.co.uk（引用 ISO 724:2023）等多個獨立來源。
export const METRIC_THREADS = {
  'M2':   { coarse: { pitch: 0.4,  drillDiameter: 1.60 },  fine: null },
  'M2.5': { coarse: { pitch: 0.45, drillDiameter: 2.05 },  fine: null },
  'M3':   { coarse: { pitch: 0.5,  drillDiameter: 2.50 },  fine: null },
  'M4':   { coarse: { pitch: 0.7,  drillDiameter: 3.30 },  fine: null },
  'M5':   { coarse: { pitch: 0.8,  drillDiameter: 4.20 },  fine: null },
  'M6':   { coarse: { pitch: 1.0,  drillDiameter: 5.00 },  fine: { pitch: 0.75, drillDiameter: 5.25 } },
  'M8':   { coarse: { pitch: 1.25, drillDiameter: 6.80 },  fine: { pitch: 1.0,  drillDiameter: 7.00 } },
  'M10':  { coarse: { pitch: 1.5,  drillDiameter: 8.50 },  fine: { pitch: 1.25, drillDiameter: 8.80 } },
  'M12':  { coarse: { pitch: 1.75, drillDiameter: 10.20 }, fine: { pitch: 1.5,  drillDiameter: 10.50 } },
  'M14':  { coarse: { pitch: 2.0,  drillDiameter: 12.00 }, fine: { pitch: 1.5,  drillDiameter: 12.50 } },
  'M16':  { coarse: { pitch: 2.0,  drillDiameter: 14.00 }, fine: { pitch: 1.5,  drillDiameter: 14.50 } },
  'M18':  { coarse: { pitch: 2.5,  drillDiameter: 15.50 }, fine: { pitch: 1.5,  drillDiameter: 16.50 } },
  'M20':  { coarse: { pitch: 2.5,  drillDiameter: 17.50 }, fine: { pitch: 1.5,  drillDiameter: 18.50 } },
  'M22':  { coarse: { pitch: 2.5,  drillDiameter: 19.50 }, fine: { pitch: 1.5,  drillDiameter: 20.50 } },
  'M24':  { coarse: { pitch: 3.0,  drillDiameter: 21.00 }, fine: { pitch: 2.0,  drillDiameter: 22.00 } }
};

// 資料來源：ANSI/ASME B1.1 統一螺紋標準（UNC/UNF）攻牙底孔對照表，
// 查證時交叉比對 Wikipedia (Unified Thread Standard)、ETSU 機工課程對照表
// （內容與 Machinery's Handbook 標準表一致）等多個獨立來源。
// drillDiameter 已從英吋換算成公厘（原始英吋值 × 25.4）。
export const IMPERIAL_THREADS = {
  '#4':   { coarse: { tpi: 40, drillDiameter: 2.26 },  fine: { tpi: 48, drillDiameter: 2.37 } },
  '#6':   { coarse: { tpi: 32, drillDiameter: 2.71 },  fine: { tpi: 40, drillDiameter: 2.87 } },
  '#8':   { coarse: { tpi: 32, drillDiameter: 3.45 },  fine: { tpi: 36, drillDiameter: 3.45 } },
  '#10':  { coarse: { tpi: 24, drillDiameter: 3.80 },  fine: { tpi: 32, drillDiameter: 4.04 } },
  '#12':  { coarse: { tpi: 24, drillDiameter: 4.50 },  fine: { tpi: 28, drillDiameter: 4.62 } },
  '1/4':  { coarse: { tpi: 20, drillDiameter: 5.11 },  fine: { tpi: 28, drillDiameter: 5.41 } },
  '5/16': { coarse: { tpi: 18, drillDiameter: 6.53 },  fine: { tpi: 24, drillDiameter: 6.91 } },
  '3/8':  { coarse: { tpi: 16, drillDiameter: 7.94 },  fine: { tpi: 24, drillDiameter: 8.43 } },
  '7/16': { coarse: { tpi: 14, drillDiameter: 9.35 },  fine: { tpi: 20, drillDiameter: 9.92 } },
  '1/2':  { coarse: { tpi: 13, drillDiameter: 10.72 }, fine: { tpi: 20, drillDiameter: 11.51 } },
  '9/16': { coarse: { tpi: 12, drillDiameter: 12.30 }, fine: { tpi: 18, drillDiameter: 13.10 } },
  '5/8':  { coarse: { tpi: 11, drillDiameter: 13.49 }, fine: { tpi: 18, drillDiameter: 14.68 } },
  '3/4':  { coarse: { tpi: 10, drillDiameter: 16.67 }, fine: { tpi: 16, drillDiameter: 17.46 } },
  '7/8':  { coarse: { tpi: 9,  drillDiameter: 19.45 }, fine: { tpi: 14, drillDiameter: 20.64 } },
  '1':    { coarse: { tpi: 8,  drillDiameter: 22.23 }, fine: { tpi: 14, drillDiameter: 23.81 } }
};

// 明確宣告顯示順序，不依賴 Object.keys() 的列舉順序——JS 引擎會把「看起來像陣列
// 索引的純數字字串」鍵（例如 IMPERIAL_THREADS 裡的 '1'）自動排到所有字串鍵之前，
// 跟原始碼裡的宣告順序無關，所以順序必須另外用陣列明確維護。
const METRIC_SIZE_ORDER = [
  'M2', 'M2.5', 'M3', 'M4', 'M5', 'M6', 'M8', 'M10',
  'M12', 'M14', 'M16', 'M18', 'M20', 'M22', 'M24'
];

const IMPERIAL_SIZE_ORDER = [
  '#4', '#6', '#8', '#10', '#12', '1/4', '5/16', '3/8',
  '7/16', '1/2', '9/16', '5/8', '3/4', '7/8', '1'
];

function getTable(system) {
  if (system === 'metric') return METRIC_THREADS;
  if (system === 'imperial') return IMPERIAL_THREADS;
  throw new Error(`Unknown thread system: ${system}`);
}

function getSizeOrder(system) {
  if (system === 'metric') return METRIC_SIZE_ORDER;
  if (system === 'imperial') return IMPERIAL_SIZE_ORDER;
  throw new Error(`Unknown thread system: ${system}`);
}

function getEntry(system, nominalSize) {
  const table = getTable(system);
  const entry = table[nominalSize];
  if (!entry) throw new Error(`Unknown ${system} thread size: ${nominalSize}`);
  return entry;
}

export function getNominalSizes(system) {
  return [...getSizeOrder(system)];
}

export function hasFineOption(system, nominalSize) {
  return getEntry(system, nominalSize).fine !== null;
}

export function getTapDrillSize(system, nominalSize, { fine = false } = {}) {
  const entry = getEntry(system, nominalSize);
  const variant = fine ? entry.fine : entry.coarse;
  if (!variant) throw new Error(`${nominalSize} has no fine variant`);
  const exactDrillDiameter = variant.drillDiameter;
  return {
    system,
    nominalSize,
    isFine: fine,
    pitch: system === 'metric' ? variant.pitch : undefined,
    tpi: system === 'imperial' ? variant.tpi : undefined,
    exactDrillDiameter,
    standardDrillDiameter: nearestStandardDiameter(exactDrillDiameter)
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS for `tapDrill.test.js`. All other existing test files must remain passing too (this task doesn't touch any shared file).

- [ ] **Step 5: Commit**

```bash
git add assets/core/tapDrill.js assets/core/tapDrill.test.js
git commit -m "feat: add standard tap drill size lookup for metric and imperial threads"
```

---

### Task 2: `ui/tapDrillView.js` — 選單與結果渲染

**Files:**
- Create: `assets/ui/tapDrillView.js`
- Create: `assets/ui/tapDrillView.test.js`

**Interfaces:**
- Consumes: `getNominalSizes`, `getTapDrillSize` (Task 1)
- Produces: `TAP_DRILL_CAVEAT` (string)、`renderSizeOptionsHtml(system): string`、`renderTapResultHtml(result): string`

- [ ] **Step 1: Write the failing tests**

Create `assets/ui/tapDrillView.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `tapDrillView.js` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `assets/ui/tapDrillView.js`:

```js
import { getNominalSizes } from '../core/tapDrill.js';

export const TAP_DRILL_CAVEAT =
  '以上為公制 ISO 965 / 英制 UNC-UNF 標準 75% 牙深嚙合建議值,適用於一般材料;特殊材料或精度需求仍應依刀具廠商規格微調。';

function formatImperialSize(nominalSize) {
  return nominalSize.startsWith('#') ? nominalSize : nominalSize + '"';
}

export function renderSizeOptionsHtml(system) {
  return getNominalSizes(system)
    .map((size) => '<option value="' + size + '">' + size + '</option>')
    .join('');
}

export function renderTapResultHtml(result) {
  const sizeLabel = result.system === 'metric' ? result.nominalSize : formatImperialSize(result.nominalSize);
  const threadLabel =
    result.system === 'metric'
      ? sizeLabel + (result.isFine ? ' 細牙' : ' 粗牙') + '・螺距 ' + result.pitch + 'mm'
      : sizeLabel + '-' + result.tpi + ' ' + (result.isFine ? 'UNF' : 'UNC');
  return (
    '<div class="tap-result-line">' +
    threadLabel +
    ' → 建議底孔 <strong>' +
    result.standardDrillDiameter +
    ' mm</strong></div>' +
    '<div class="tap-caveat">' +
    TAP_DRILL_CAVEAT +
    '</div>'
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS for `tapDrillView.test.js` and `tapDrill.test.js`. All other existing test files remain passing.

- [ ] **Step 5: Commit**

```bash
git add assets/ui/tapDrillView.js assets/ui/tapDrillView.test.js
git commit -m "feat: render tap drill size selects and result"
```

---

### Task 3: `tool.html` + `assets/style.css` — 新增查詢區塊標記與樣式

**Files:**
- Modify: `tool.html`
- Modify: `assets/style.css`

**Interfaces:**
- Produces: DOM elements `#tapSystem`(公制/英制下拉)、`#tapSize`(規格下拉,空的,Task 4 的 controller 負責填入)、`#tapFineToggle`(核取方塊)、`#tapResult`(結果顯示區),供 Task 4 使用

- [ ] **Step 1: 在 `tool.html` 新增區塊**

在 `tool.html` 裡,找到現有計算機的 `</section>`(第 76 行,緊接在 `<div class="actions">...</div>` 之後)跟 `<footer class="note">` 之間,插入新的一個 `<section class="panel">`:

Replace:
```html
  </section>

  <footer class="note">
```

With:
```html
  </section>

  <section class="panel" aria-label="攻牙底孔查詢">
    <h2 class="panel-title">攻牙底孔查詢</h2>
    <div class="field-grid">
      <div class="field">
        <label for="tapSystem">系統</label>
        <select id="tapSystem">
          <option value="metric">公制</option>
          <option value="imperial">英制</option>
        </select>
      </div>
      <div class="field">
        <label for="tapSize">規格</label>
        <select id="tapSize"></select>
      </div>
    </div>
    <label class="tap-fine-toggle">
      <input type="checkbox" id="tapFineToggle"> 這顆是細牙?
    </label>
    <div class="tap-result" id="tapResult"></div>
  </section>

  <footer class="note">
```

- [ ] **Step 2: 在 `assets/style.css` 新增樣式**

在 `assets/style.css` 裡,找到這個既有區塊(在 `.field select.voice-filled` 之後):

```css
.field select.voice-filled {
  animation: voice-filled-pulse 1.4s ease-out;
}

.params-line {
```

Replace with:
```css
.field select.voice-filled {
  animation: voice-filled-pulse 1.4s ease-out;
}

.panel-title {
  margin: 0 0 14px;
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
}

.tap-fine-toggle {
  display: block;
  margin-top: 14px;
  font-size: 13px;
  color: var(--text-muted);
}

.tap-result {
  margin-top: 16px;
  min-height: 20px;
  background: linear-gradient(160deg, var(--readout-bg), var(--readout-bg-2));
  border-radius: 12px;
  padding: 16px;
  font-size: 14px;
  color: var(--readout-text);
}

.tap-result strong {
  font-family: "IBM Plex Mono", monospace;
}

.tap-result .tap-caveat {
  margin-top: 10px;
  font-size: 12px;
  color: var(--readout-text-dim);
}

.params-line {
```

- [ ] **Step 3: 手動確認畫面(選單此時還是空的,Task 4 才會接上邏輯)**

在瀏覽器打開 `tool.html`,確認畫面上現有計算機下方出現一個新的「攻牙底孔查詢」卡片,裡面「系統」下拉選單有「公制/英制」兩個選項,「規格」下拉選單目前是空的(這是預期的,Task 4 完成後才會填入選項),下方有「這顆是細牙?」核取方塊,版面沒有跑版。

- [ ] **Step 4: Commit**

```bash
git add tool.html assets/style.css
git commit -m "feat: add tap drill size query section markup and styles"
```

---

### Task 4: `ui/tapDrillController.js` — 串接查詢邏輯

**Files:**
- Create: `assets/ui/tapDrillController.js`
- Modify: `tool.html`(新增一行 `<script>` 標籤)

**Interfaces:**
- Consumes: `hasFineOption`, `getTapDrillSize` (Task 1); `renderSizeOptionsHtml`, `renderTapResultHtml` (Task 2); DOM elements `#tapSystem`, `#tapSize`, `#tapFineToggle`, `#tapResult` (Task 3)
- Produces: 無(這是這個功能區塊的最上層串接,不被其他 task 依賴)

這個檔案碰 `document`,不寫自動化測試,手動瀏覽器驗證(Task 5)。

- [ ] **Step 1: Write the implementation**

Create `assets/ui/tapDrillController.js`:

```js
import { hasFineOption, getTapDrillSize } from '../core/tapDrill.js';
import { renderSizeOptionsHtml, renderTapResultHtml } from './tapDrillView.js';

const tapSystemEl = document.getElementById('tapSystem');
const tapSizeEl = document.getElementById('tapSize');
const tapFineToggleEl = document.getElementById('tapFineToggle');
const tapResultEl = document.getElementById('tapResult');

function refreshFineToggleAvailability() {
  const canBeFine = hasFineOption(tapSystemEl.value, tapSizeEl.value);
  tapFineToggleEl.disabled = !canBeFine;
  if (!canBeFine) tapFineToggleEl.checked = false;
}

function recompute() {
  refreshFineToggleAvailability();
  const result = getTapDrillSize(tapSystemEl.value, tapSizeEl.value, { fine: tapFineToggleEl.checked });
  tapResultEl.innerHTML = renderTapResultHtml(result);
}

function refreshSizeOptions() {
  tapSizeEl.innerHTML = renderSizeOptionsHtml(tapSystemEl.value);
}

tapSystemEl.addEventListener('change', () => {
  refreshSizeOptions();
  tapFineToggleEl.checked = false;
  recompute();
});
tapSizeEl.addEventListener('change', recompute);
tapFineToggleEl.addEventListener('change', recompute);

refreshSizeOptions();
recompute();
```

- [ ] **Step 2: 在 `tool.html` 加上 script 標籤**

找到:
```html
<script type="module" src="assets/ui/toolController.js"></script>
<script type="module" src="assets/ui/voiceInputController.js"></script>
```

Replace with:
```html
<script type="module" src="assets/ui/toolController.js"></script>
<script type="module" src="assets/ui/voiceInputController.js"></script>
<script type="module" src="assets/ui/tapDrillController.js"></script>
```

- [ ] **Step 3: 手動確認畫面**

在瀏覽器打開 `tool.html`,確認:
- 「規格」選單載入後有內容,公制預設是 M2 開頭,英制切換後變成 #4 開頭
- 選公制 M6,下方結果顯示「M6 粗牙・螺距 1mm → 建議底孔 5 mm」
- 勾選「這顆是細牙?」,結果變成「M6 細牙・螺距 0.75mm → 建議底孔 5.2 mm」左右的數字(套用 `nearestStandardDiameter` 後的值)
- 選一個沒有細牙選項的規格(例如公制 M3),確認「這顆是細牙?」核取方塊變成灰色不可勾選,且自動取消勾選
- 切換系統(公制⇄英制),確認「規格」選單內容跟著換,細牙核取方塊重置成未勾選

- [ ] **Step 4: Commit**

```bash
git add assets/ui/tapDrillController.js tool.html
git commit -m "feat: wire tap drill size query selects and result"
```

---

### Task 5: 手動端對端驗證

**Files:** none — manual browser verification, matching this project's established pattern for DOM-touching code.

- [ ] **Step 1: 基本流程**

打開 `tool.html`(需要跑本機靜態伺服器,例如 `npx serve`,不能用 `file://`)。確認「攻牙底孔查詢」區塊跟現有的「鑽頭選擇」計算機互不干擾——在計算機那邊輸入直徑、選材料,再切去操作攻牙底孔查詢,兩邊的狀態不會互相影響。

- [ ] **Step 2: 逐一測試公制規格**

依序選過 M2、M2.5、M3、M6、M10、M16、M24,確認每個都能顯示結果、沒有 JS 錯誤(打開 DevTools Console 確認)。M2、M2.5、M3 這幾個沒有細牙選項,確認核取方塊是灰的;M6、M10、M16、M24 有細牙選項,勾選後確認數字有跟著變。

- [ ] **Step 3: 逐一測試英制規格**

切到英制,依序選過 #4、#8、1/4、1/2、1,確認每個都能顯示結果(標籤格式類似「1/4"-20 UNC → 建議底孔 5.1 mm」),勾選細牙確認變成 UNF 標籤跟不同的底孔直徑。

- [ ] **Step 4: 確認結果數字跟研究資料一致**

任選兩三組手動核對:M6 粗牙應顯示建議底孔 5mm;1/4" UNC 應顯示建議底孔 5.1mm(理論值 5.11mm 套用 `nearestStandardDiameter` 後的結果);1" UNC 應顯示建議底孔 22mm。

- [ ] **Step 5: 確認既有功能不受影響**

回到現有的鑽頭 Vc/RPM/進給量計算機,任意選一組材料跑一次計算,確認結果正常、`npm test` 全部通過,確認這次新增沒有破壞任何既有功能。
