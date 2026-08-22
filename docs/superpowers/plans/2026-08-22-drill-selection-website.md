# 鑽頭選擇系統網站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 3-page static website (home, drill-selection tool, history) that recommends and compares HSS / carbide / coated-carbide drill parameters for aluminum drilling, replacing the single-page `drill-console.html` calculator.

**Architecture:** Responsibilities are split into separate files/folders so a change to one layer can't silently break another:

```
assets/
  core/           input rules + calculation logic (pure, unit-tested)
    diameter.js       standard drill sizes + diameter normalization ("輸入規則")
    materials.js       drill materials, alloys, Vc/RPM/feed calculation ("計算/排序邏輯")
    format.js           number formatting
  data/           persistence (pure, unit-tested, storage is dependency-injected)
    historyStore.js    localStorage read/write for history records ("資料存取")
  ui/             DOM layer
    toolView.js         pure functions: data -> HTML strings for the tool page ("畫面")
    toolController.js    DOM event wiring for tool.html, no business logic ("操作")
    historyView.js       pure functions: data -> HTML strings for the history page ("畫面")
    historyController.js DOM event wiring for history.html, no business logic ("操作")
  style.css        shared visual design
```

`core/` and `data/` know nothing about the DOM and are covered by Node unit tests. `ui/*View.js` files are also pure (return HTML strings, no `document` access) and are unit-tested. `ui/*Controller.js` files are the only place that touches `document`/`localStorage` directly — they just wire events to the layers above and are verified manually in a browser. This means: changing the visual layout only touches `*View.js`, changing the calculation only touches `core/`, changing storage only touches `data/`.

**Tech Stack:** Plain HTML/CSS/JavaScript (ES modules), Node.js built-in test runner (`node --test`), Google Fonts (Noto Sans TC + IBM Plex Mono), deployed later to GitHub Pages (separate step, not part of this plan).

**Spec:** [docs/superpowers/specs/2026-08-22-drill-selection-website-design.md](../specs/2026-08-22-drill-selection-website-design.md)

## Global Constraints

- Metric units only.
- Aluminum alloys only for now: `6061`, `7075`, `a380` (A380 壓鑄鋁), `custom` (自訂鋁合金).
- Drill diameter must snap to standard DIN 338-style sizes: 1.0–13.0mm every 0.1mm, 13.5–20.0mm every 0.5mm, 21–32mm every 1mm.
- No user-adjustable Vc/f sliders — these are computed, read-only reference values.
- Feed rate `f` depends only on diameter, not drill material (intentional simplification carried over from the spec).
- No login, no backend, no shared/cross-user data — history is per-browser `localStorage` only.
- Every file has one responsibility per the folder layout above — do not add calculation logic to a `*Controller.js` or `*View.js` file, and do not touch `document`/`localStorage` from `core/`.
- No automated DOM/interaction tests — `*Controller.js` wiring is verified manually in a browser. Everything else (`core/`, `data/`, `*View.js`) is pure and unit-tested.
- Every color in `assets/style.css` must be defined for both light and dark themes (reuse the token structure already validated in `drill-console.html`).

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `assets/core/`, `assets/data/`, `assets/ui/` (empty directories, populated by later tasks)

**Interfaces:**
- Produces: `npm test` runs `node --test` (auto-discovers every `**/*.test.js`) for all later tasks' test files.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "drill-selection-website",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
```

- [ ] **Step 3: Create the directories**

```bash
mkdir -p assets/core assets/data assets/ui
```

- [ ] **Step 4: Commit**

```bash
git add package.json .gitignore assets
git commit -m "chore: scaffold drill selection website project"
```

---

### Task 2: `core/diameter.js` — standard sizes and diameter normalization (輸入規則)

**Files:**
- Create: `assets/core/diameter.js`
- Create: `assets/core/diameter.test.js`

**Interfaces:**
- Produces: `STANDARD_SIZES` (array of numbers), `buildStandardSizes(): number[]`, `nearestStandardDiameter(raw: number): number`.

- [ ] **Step 1: Write the failing tests**

Create `assets/core/diameter.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STANDARD_SIZES, nearestStandardDiameter } from './diameter.js';

test('nearestStandardDiameter returns the exact value when already standard', () => {
  assert.equal(nearestStandardDiameter(8), 8);
});

test('nearestStandardDiameter snaps a non-standard value to the closest standard size', () => {
  assert.equal(nearestStandardDiameter(3.672), 3.7);
});

test('nearestStandardDiameter clamps values above the largest standard size', () => {
  assert.equal(nearestStandardDiameter(40), 32);
});

test('nearestStandardDiameter clamps values below the smallest standard size', () => {
  assert.equal(nearestStandardDiameter(0.5), 1);
});

test('STANDARD_SIZES spans from 1.0mm to 32.0mm', () => {
  assert.equal(STANDARD_SIZES[0], 1);
  assert.equal(STANDARD_SIZES[STANDARD_SIZES.length - 1], 32);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `assets/core/diameter.js` does not exist yet (module not found).

- [ ] **Step 3: Write the implementation**

Create `assets/core/diameter.js`:

```js
// Standard metric twist drill sizes (DIN 338 series):
// 1.0-13.0mm every 0.1mm, 13.5-20.0mm every 0.5mm, 21-32mm every 1mm.
export function buildStandardSizes() {
  const round2 = (n) => Math.round(n * 100) / 100;
  const sizes = [];
  for (let i = 0; i <= 120; i++) sizes.push(round2(1.0 + i * 0.1));
  for (let j = 1; j <= 14; j++) sizes.push(round2(13.0 + j * 0.5));
  for (let k = 1; k <= 12; k++) sizes.push(round2(20.0 + k * 1.0));
  return sizes;
}

export const STANDARD_SIZES = buildStandardSizes();
const DIA_MIN = STANDARD_SIZES[0];
const DIA_MAX = STANDARD_SIZES[STANDARD_SIZES.length - 1];

export function nearestStandardDiameter(raw) {
  if (raw <= DIA_MIN) return DIA_MIN;
  if (raw >= DIA_MAX) return DIA_MAX;
  let best = STANDARD_SIZES[0];
  let bestDiff = Infinity;
  for (const size of STANDARD_SIZES) {
    const diff = Math.abs(size - raw);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = size;
    }
  }
  return best;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add assets/core/diameter.js assets/core/diameter.test.js
git commit -m "feat: add standard drill size table and diameter normalization"
```

---

### Task 3: `core/materials.js` — Vc / RPM / feed-rate calculation (計算/排序邏輯)

**Files:**
- Create: `assets/core/materials.js`
- Create: `assets/core/materials.test.js`

**Interfaces:**
- Consumes: `nearestStandardDiameter` from Task 2 (`../core/diameter.js` when imported from another folder, `./diameter.js` from within `core/`).
- Produces: `FEED_BANDS` (array of `{dmax, fmin, fmax, def}`), `getFeedBand(diameter: number): {dmax, fmin, fmax, def}`, `DRILL_MATERIALS` (array of `{key, label, vcMin, vcMax}`, fixed display order: hss, carbide, coated), `ALLOY_BIAS` (object), `ALLOY_LABELS` (object), `computeVc(drillMatKey: string, alloyKey: string): number`, `computeResultForMaterial(diameter: number, alloyKey: string, drillMatKey: string): {drillMat, drillMatLabel, vc, f, rpm, feedRate}`, `computeAllResults(rawDiameter: number, alloyKey: string): {diameter: number, results: Array}`.

- [ ] **Step 1: Write the failing tests**

Create `assets/core/materials.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `assets/core/materials.js` does not exist yet (module not found).

- [ ] **Step 3: Write the implementation**

Create `assets/core/materials.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add assets/core/materials.js assets/core/materials.test.js
git commit -m "feat: add Vc/RPM/feed-rate calculation for the three drill materials"
```

---

### Task 4: `core/format.js` — number formatting

**Files:**
- Create: `assets/core/format.js`
- Create: `assets/core/format.test.js`

**Interfaces:**
- Produces: `formatNumber(n: number, digits: number): string`.

- [ ] **Step 1: Write the failing test**

Create `assets/core/format.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber } from './format.js';

test('formatNumber formats with a fixed number of decimal places and thousands separators', () => {
  assert.equal(formatNumber(2029, 0), '2,029');
  assert.equal(formatNumber(0.125, 2), '0.13');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `assets/core/format.js` does not exist yet (module not found).

- [ ] **Step 3: Write the implementation**

Create `assets/core/format.js`:

```js
export function formatNumber(n, digits) {
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (13 tests)

- [ ] **Step 5: Commit**

```bash
git add assets/core/format.js assets/core/format.test.js
git commit -m "feat: add shared number formatting helper"
```

---

### Task 5: `data/historyStore.js` — per-browser history storage (資料存取)

**Files:**
- Create: `assets/data/historyStore.js`
- Create: `assets/data/historyStore.test.js`

**Interfaces:**
- Consumes: `ALLOY_LABELS` from `../core/materials.js`, `computeAllResults` from `../core/materials.js` (test fixtures only).
- Produces: `HISTORY_STORAGE_KEY` (string), `loadHistory(storage): Array`, `saveHistory(storage, list): void`, `addHistoryRecord(storage, diameter: number, alloyKey: string, results: Array): Array`, `deleteHistoryRecord(storage, id: string): Array`, `clearHistory(storage): Array`. `storage` is any object implementing `getItem(key)`/`setItem(key, value)` (the browser's `localStorage`, or a test double) — this file never touches `document` or the real `localStorage` global directly, so it works identically in Node tests and in the browser.

- [ ] **Step 1: Write the failing tests**

Create `assets/data/historyStore.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAllResults } from '../core/materials.js';
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

test('addHistoryRecord stores a record with id, timestamp, and all three material results', () => {
  const storage = createMemoryStorage();
  const { results } = computeAllResults(8, '6061');
  const list = addHistoryRecord(storage, 8, '6061', results);
  assert.equal(list.length, 1);
  assert.equal(list[0].diameter, 8);
  assert.equal(list[0].alloyLabel, '6061');
  assert.equal(list[0].results.length, 3);
  assert.ok(list[0].id);
  assert.ok(list[0].timestamp);
});

test('addHistoryRecord puts the newest record first', () => {
  const storage = createMemoryStorage();
  const { results } = computeAllResults(8, '6061');
  addHistoryRecord(storage, 8, '6061', results);
  addHistoryRecord(storage, 10, '7075', results);
  const list = loadHistory(storage);
  assert.equal(list[0].diameter, 10);
  assert.equal(list[1].diameter, 8);
});

test('deleteHistoryRecord removes only the matching record', () => {
  const storage = createMemoryStorage();
  const { results } = computeAllResults(8, '6061');
  addHistoryRecord(storage, 8, '6061', results);
  const [{ id }] = loadHistory(storage);
  addHistoryRecord(storage, 10, '7075', results);
  const remaining = deleteHistoryRecord(storage, id);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].diameter, 10);
});

test('clearHistory empties the stored list', () => {
  const storage = createMemoryStorage();
  const { results } = computeAllResults(8, '6061');
  addHistoryRecord(storage, 8, '6061', results);
  clearHistory(storage);
  assert.deepEqual(loadHistory(storage), []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `assets/data/historyStore.js` does not exist yet (module not found).

- [ ] **Step 3: Write the implementation**

Create `assets/data/historyStore.js`:

```js
import { ALLOY_LABELS } from '../core/materials.js';

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
  storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(list));
}

function makeRecordId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export function addHistoryRecord(storage, diameter, alloyKey, results) {
  const list = loadHistory(storage);
  list.unshift({
    id: makeRecordId(),
    timestamp: new Date().toISOString(),
    diameter,
    alloy: alloyKey,
    alloyLabel: ALLOY_LABELS[alloyKey],
    results
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
Expected: PASS (19 tests)

- [ ] **Step 5: Commit**

```bash
git add assets/data/historyStore.js assets/data/historyStore.test.js
git commit -m "feat: add per-browser history storage logic"
```

---

### Task 6: `ui/toolView.js` — pure rendering for the tool page (畫面)

**Files:**
- Create: `assets/ui/toolView.js`
- Create: `assets/ui/toolView.test.js`

**Interfaces:**
- Consumes: `formatNumber` from `../core/format.js`, `DRILL_MATERIALS` from `../core/materials.js`.
- Produces: `EMPTY_COMPARE_ROW` (string), `GUIDANCE_DEFAULT_TEXT` (string), `GUIDANCE_RESULT_HTML` (string), `renderCompareRows(results: Array): string`, `renderDiameterHint(rawDiameter: number, normalizedDiameter: number): string`. No function here touches `document` — every function takes data in and returns an HTML string.

- [ ] **Step 1: Write the failing tests**

Create `assets/ui/toolView.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `assets/ui/toolView.js` does not exist yet (module not found).

- [ ] **Step 3: Write the implementation**

Create `assets/ui/toolView.js`:

```js
import { formatNumber } from '../core/format.js';
import { DRILL_MATERIALS } from '../core/materials.js';

export const EMPTY_COMPARE_ROW =
  '<tr><td colspan="6" style="color: var(--readout-text-dim); padding: 20px 14px;">輸入直徑後顯示比較結果</td></tr>';

export const GUIDANCE_DEFAULT_TEXT = '選擇材質並輸入直徑後,顯示選用原則';
export const GUIDANCE_RESULT_HTML =
  '一般用途或單件加工可選 <strong>高速鋼 HSS</strong>;長時間量產或需拉高轉速可選 <strong>硬質合金 / 塗層硬質合金</strong>。';

function vcRangeLabel(drillMatKey) {
  const material = DRILL_MATERIALS.find((m) => m.key === drillMatKey);
  return material.vcMin + '–' + material.vcMax + ' m/min';
}

export function renderCompareRows(results) {
  return results
    .map(
      (r) =>
        '<tr>' +
        '<td class="mat-name">' + r.drillMatLabel + '</td>' +
        '<td>' + vcRangeLabel(r.drillMat) + '</td>' +
        '<td>' + r.vc + ' m/min</td>' +
        '<td class="rpm-cell">' + formatNumber(r.rpm, 0) + '</td>' +
        '<td>' + formatNumber(r.f, 2) + ' mm/rev</td>' +
        '<td class="feed-cell">' + formatNumber(r.feedRate, 0) + ' mm/min</td>' +
        '</tr>'
    )
    .join('');
}

export function renderDiameterHint(rawDiameter, normalizedDiameter) {
  if (Math.abs(rawDiameter - normalizedDiameter) < 0.001) {
    return '✓ 市售標準鑽頭尺寸';
  }
  return '⚙ ' + rawDiameter + 'mm 非市售規格,已對應到最接近的 <strong>' + normalizedDiameter + ' mm</strong> 計算';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (22 tests)

- [ ] **Step 5: Commit**

```bash
git add assets/ui/toolView.js assets/ui/toolView.test.js
git commit -m "feat: add pure render functions for the tool page comparison table"
```

---

### Task 7: `ui/historyView.js` — pure rendering for the history page (畫面)

**Files:**
- Create: `assets/ui/historyView.js`
- Create: `assets/ui/historyView.test.js`

**Interfaces:**
- Consumes: `formatNumber` from `../core/format.js`.
- Produces: `EMPTY_STATE_HTML` (string), `renderHistoryRecord(record): string`, `renderHistoryList(list: Array): string`. No function here touches `document`.

- [ ] **Step 1: Write the failing tests**

Create `assets/ui/historyView.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAllResults } from '../core/materials.js';
import { renderHistoryList, EMPTY_STATE_HTML } from './historyView.js';

test('renderHistoryList shows the empty state for an empty list', () => {
  assert.equal(renderHistoryList([]), EMPTY_STATE_HTML);
});

test('renderHistoryList renders a record with its diameter, alloy, and all three material rows', () => {
  const { results } = computeAllResults(8, '6061');
  const record = {
    id: 'abc123',
    timestamp: '2026-08-22T00:00:00.000Z',
    diameter: 8,
    alloy: '6061',
    alloyLabel: '6061',
    results
  };
  const html = renderHistoryList([record]);
  assert.match(html, /8mm · 6061/);
  assert.match(html, /高速鋼 HSS/);
  assert.match(html, /2,029/);
  assert.match(html, /data-id="abc123"/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `assets/ui/historyView.js` does not exist yet (module not found).

- [ ] **Step 3: Write the implementation**

Create `assets/ui/historyView.js`:

```js
import { formatNumber } from '../core/format.js';

export const EMPTY_STATE_HTML =
  '<div class="empty-state">尚無記錄,到「鑽頭選擇」頁計算後按「加入記錄」即可保存於此</div>';

function renderRecordRows(results) {
  return results
    .map(
      (r) =>
        '<tr>' +
        '<td>' + r.drillMatLabel + '</td>' +
        '<td>' + formatNumber(r.rpm, 0) + ' RPM</td>' +
        '<td>' + formatNumber(r.f, 2) + ' mm/rev · ' + formatNumber(r.feedRate, 0) + ' mm/min</td>' +
        '</tr>'
    )
    .join('');
}

export function renderHistoryRecord(record) {
  const time = new Date(record.timestamp).toLocaleString('zh-TW');
  return (
    '<div class="history-record">' +
    '<div class="record-head">' +
    '<span class="record-title">' + record.diameter + 'mm · ' + record.alloyLabel + '</span>' +
    '<span class="record-time">' + time + '</span>' +
    '<button class="del-btn btn-ghost" data-id="' + record.id + '">刪除</button>' +
    '</div>' +
    '<table><thead><tr><th>材質</th><th>轉速</th><th>進給量</th></tr></thead><tbody>' +
    renderRecordRows(record.results) +
    '</tbody></table>' +
    '</div>'
  );
}

export function renderHistoryList(list) {
  if (list.length === 0) return EMPTY_STATE_HTML;
  return list.map(renderHistoryRecord).join('');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (24 tests)

- [ ] **Step 5: Commit**

```bash
git add assets/ui/historyView.js assets/ui/historyView.test.js
git commit -m "feat: add pure render functions for the history page"
```

---

### Task 8: Shared stylesheet

**Files:**
- Create: `assets/style.css`

**Interfaces:**
- Produces: CSS custom properties and classes (`.wrap`, `nav.site-nav`, `.panel`, `.field-grid`/`.field`, `.compare-wrap`/`.compare-table`, `.params-line`, `.actions`, `button` variants, `.confirm-bar`, `.history-list`/`.history-record`, `.empty-state`, `footer.note`) consumed by Task 9 and Task 10's HTML pages.

- [ ] **Step 1: Write the stylesheet**

Create `assets/style.css`:

```css
:root {
  --bg: #eef4f9;
  --surface: #ffffff;
  --surface-alt: #e3ecf3;
  --text: #1b2733;
  --text-muted: #5b6b7c;
  --accent: #0891b2;
  --accent-strong: #075e70;
  --accent-soft: #d6eef4;
  --readout-bg: #0e2a38;
  --readout-bg-2: #123648;
  --readout-text: #7dd3fc;
  --readout-text-dim: #4c7f96;
  --border: #c7d6e0;
  --danger: #dc2626;
  --danger-soft: #fce8e8;
  --shadow: 0 1px 2px rgba(20, 40, 60, 0.06), 0 8px 24px -12px rgba(20, 40, 60, 0.18);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0b1720;
    --surface: #12222e;
    --surface-alt: #1a303f;
    --text: #e4eef5;
    --text-muted: #93a9b8;
    --accent: #38bdf8;
    --accent-strong: #7dd3fc;
    --accent-soft: #163243;
    --readout-bg: #061620;
    --readout-bg-2: #0a1e2b;
    --readout-text: #7dd3fc;
    --readout-text-dim: #2f5568;
    --border: #24404f;
    --danger: #f87171;
    --danger-soft: #3a1616;
    --shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px -12px rgba(0, 0, 0, 0.5);
  }
}

:root[data-theme="dark"] {
  --bg: #0b1720;
  --surface: #12222e;
  --surface-alt: #1a303f;
  --text: #e4eef5;
  --text-muted: #93a9b8;
  --accent: #38bdf8;
  --accent-strong: #7dd3fc;
  --accent-soft: #163243;
  --readout-bg: #061620;
  --readout-bg-2: #0a1e2b;
  --readout-text: #7dd3fc;
  --readout-text-dim: #2f5568;
  --border: #24404f;
  --danger: #f87171;
  --danger-soft: #3a1616;
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px -12px rgba(0, 0, 0, 0.5);
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

.wrap {
  max-width: 880px;
  margin: 0 auto;
  padding: 0 20px 64px;
}

nav.site-nav {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 28px;
}

nav.site-nav .brand {
  font-weight: 900;
  font-size: 16px;
  letter-spacing: 0.01em;
  margin-right: auto;
}

nav.site-nav a {
  color: var(--text-muted);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  padding: 6px 4px;
  border-bottom: 2px solid transparent;
}

nav.site-nav a:hover,
nav.site-nav a[aria-current="page"] {
  color: var(--accent-strong);
  border-bottom-color: var(--accent);
}

header.page { margin-bottom: 20px; }

header.page h1 {
  font-size: 22px;
  font-weight: 900;
  letter-spacing: 0.01em;
  margin: 0 0 6px;
  text-wrap: balance;
}

header.page p {
  margin: 0;
  color: var(--text-muted);
  font-size: 14px;
}

.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow);
  padding: 22px;
}

.panel + .panel { margin-top: 20px; }

.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
}

.field label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.field input[type="number"],
.field select {
  width: 100%;
  font: inherit;
  font-family: "IBM Plex Mono", monospace;
  font-size: 15px;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 9px 10px;
  appearance: none;
}

.field select { font-family: "Noto Sans TC", sans-serif; font-size: 14px; }

.field input[type="number"]:focus,
.field select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.field .hint {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 5px;
  font-family: "IBM Plex Mono", monospace;
  min-height: 14px;
}

.params-line {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px dashed var(--border);
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.8;
}

.params-line strong {
  font-family: "IBM Plex Mono", monospace;
  color: var(--accent-strong);
  font-weight: 600;
}

.compare-wrap {
  margin-top: 20px;
  background: linear-gradient(160deg, var(--readout-bg), var(--readout-bg-2));
  border-radius: 12px;
  padding: 8px;
  overflow-x: auto;
}

table.compare-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 560px;
  font-size: 13px;
}

table.compare-table th {
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--readout-text-dim);
  padding: 10px 14px;
}

table.compare-table td {
  padding: 12px 14px;
  font-family: "IBM Plex Mono", monospace;
  font-variant-numeric: tabular-nums;
  color: var(--readout-text);
  border-top: 1px solid rgba(125, 211, 252, 0.12);
}

table.compare-table td.mat-name {
  font-family: "Noto Sans TC", sans-serif;
  color: #ffffff;
  font-weight: 500;
}

table.compare-table td.rpm-cell,
table.compare-table td.feed-cell {
  font-size: 16px;
  font-weight: 600;
  text-shadow: 0 0 14px rgba(125, 211, 252, 0.3);
}

.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  gap: 10px;
}

.link-button {
  display: inline-block;
  text-decoration: none;
  padding: 10px 16px;
  border-radius: 8px;
}

button {
  font: inherit;
  cursor: pointer;
  border: none;
  border-radius: 8px;
  padding: 10px 16px;
  font-weight: 500;
  font-size: 13px;
}
button:hover { filter: brightness(1.06); }
button:active { filter: brightness(0.96); }
button:disabled { opacity: 0.45; cursor: not-allowed; }

.btn-primary { background: var(--accent); color: #ffffff; }
.btn-ghost { background: transparent; color: var(--text-muted); border: 1px solid var(--border); }
.btn-danger-ghost { background: transparent; color: var(--danger); border: 1px solid var(--border); }

.confirm-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--danger-soft);
  color: var(--danger);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 12px;
  margin-bottom: 12px;
}
.confirm-bar button { padding: 5px 10px; font-size: 12px; }

.history-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.history-record {
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}

.history-record .record-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--surface-alt);
}

.history-record .record-title {
  font-weight: 700;
  font-size: 14px;
  margin-right: auto;
}

.history-record .record-time {
  font-family: "IBM Plex Mono", monospace;
  font-size: 11px;
  color: var(--text-muted);
}

.history-record table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.history-record th {
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  padding: 8px 16px;
}

.history-record td {
  padding: 8px 16px;
  font-family: "IBM Plex Mono", monospace;
  font-variant-numeric: tabular-nums;
  border-top: 1px solid var(--border);
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

footer.note {
  margin-top: 18px;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.7;
}

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; }
}
```

- [ ] **Step 2: Commit**

```bash
git add assets/style.css
git commit -m "feat: add shared stylesheet for the multi-page site"
```

---

### Task 9: Tool page — `tool.html` + `ui/toolController.js` (操作)

**Files:**
- Create: `tool.html`
- Create: `assets/ui/toolController.js`

**Interfaces:**
- Consumes: `STANDARD_SIZES`, `nearestStandardDiameter` from `../core/diameter.js`; `computeAllResults` from `../core/materials.js`; `addHistoryRecord` from `../data/historyStore.js`; `EMPTY_COMPARE_ROW`, `GUIDANCE_DEFAULT_TEXT`, `GUIDANCE_RESULT_HTML`, `renderCompareRows`, `renderDiameterHint` from `./toolView.js`.
- This file contains **no calculation and no HTML-string building** — it only reads form inputs, calls the functions above, and assigns their results to `innerHTML`/`textContent`.

- [ ] **Step 1: Create `tool.html`**

```html
<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>鑽頭選擇與計算 - 鑽頭選擇系統</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/style.css">
</head>
<body>
<nav class="site-nav">
  <span class="brand">鑽頭選擇系統</span>
  <a href="index.html">首頁</a>
  <a href="tool.html" aria-current="page">鑽頭選擇</a>
  <a href="history.html">歷史紀錄</a>
</nav>

<div class="wrap">
  <header class="page">
    <h1>鑽頭選擇與計算</h1>
    <p>輸入鑽頭直徑與鋁合金材質,自動比較三種鑽頭材質的建議轉速與進給量</p>
  </header>

  <section class="panel" aria-label="輸入與比較結果">
    <div class="field-grid">
      <div class="field">
        <label for="diameter">鑽頭直徑 (mm)</label>
        <input type="number" id="diameter" min="1" max="32" step="0.1" placeholder="例如 8" inputmode="decimal" list="drillSizeList">
        <datalist id="drillSizeList"></datalist>
        <div class="hint" id="diaHint">&nbsp;</div>
      </div>
      <div class="field">
        <label for="alloy">鋁合金材質</label>
        <select id="alloy">
          <option value="6061">6061</option>
          <option value="7075">7075</option>
          <option value="a380">A380 壓鑄鋁</option>
          <option value="custom">自訂鋁合金</option>
        </select>
      </div>
    </div>

    <div class="compare-wrap">
      <table class="compare-table">
        <thead>
          <tr>
            <th>鑽頭材質</th>
            <th>Vc 常用範圍</th>
            <th>採用 Vc</th>
            <th>RPM</th>
            <th>進給量 f</th>
            <th>進給速度</th>
          </tr>
        </thead>
        <tbody id="compareBody">
          <tr><td colspan="6" style="color: var(--readout-text-dim); padding: 20px 14px;">輸入直徑後顯示比較結果</td></tr>
        </tbody>
      </table>
    </div>

    <div class="params-line" id="guidanceLine">選擇材質並輸入直徑後,顯示選用原則</div>

    <div class="actions">
      <button class="btn-primary" id="addBtn" disabled>加入記錄</button>
    </div>
  </section>

  <footer class="note">
    直徑僅接受市售鑽頭常見規格(1.0–13.0mm 每 0.1mm、13.5–20.0mm 每 0.5mm、21–32mm 每 1mm,依 DIN 338 麻花鑽常見尺寸系列),輸入非標準值會自動對應到最接近的規格。Vc、f 為經驗常用範圍,非精確固定值,進給量僅依直徑分段,不因鑽頭材質而異。實際仍應依刀具廠商規格與機台狀況微調。目前不考慮孔深/深徑比、貫穿孔或沉頭孔。記錄僅保存在本機瀏覽器(localStorage)。
  </footer>
</div>

<script type="module" src="assets/ui/toolController.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `assets/ui/toolController.js`**

```js
import { STANDARD_SIZES, nearestStandardDiameter } from '../core/diameter.js';
import { computeAllResults } from '../core/materials.js';
import { addHistoryRecord } from '../data/historyStore.js';
import {
  EMPTY_COMPARE_ROW,
  GUIDANCE_DEFAULT_TEXT,
  GUIDANCE_RESULT_HTML,
  renderCompareRows,
  renderDiameterHint
} from './toolView.js';

const diameterEl = document.getElementById('diameter');
const alloyEl = document.getElementById('alloy');
const compareBody = document.getElementById('compareBody');
const diaHint = document.getElementById('diaHint');
const guidanceLine = document.getElementById('guidanceLine');
const addBtn = document.getElementById('addBtn');

let currentComputation = null;

function renderEmpty() {
  compareBody.innerHTML = EMPTY_COMPARE_ROW;
  diaHint.innerHTML = '&nbsp;';
  guidanceLine.textContent = GUIDANCE_DEFAULT_TEXT;
  addBtn.disabled = true;
  currentComputation = null;
}

function renderResults(rawDiameter, alloyKey) {
  const { diameter, results } = computeAllResults(rawDiameter, alloyKey);
  diaHint.innerHTML = renderDiameterHint(rawDiameter, diameter);
  compareBody.innerHTML = renderCompareRows(results);
  guidanceLine.innerHTML = GUIDANCE_RESULT_HTML;
  addBtn.disabled = false;
  currentComputation = { diameter, alloy: alloyKey, results };
}

function recompute() {
  const raw = parseFloat(diameterEl.value);
  if (!raw || raw <= 0) {
    renderEmpty();
    return;
  }
  renderResults(raw, alloyEl.value);
}

diameterEl.addEventListener('input', recompute);
diameterEl.addEventListener('blur', () => {
  const raw = parseFloat(diameterEl.value);
  if (raw > 0) diameterEl.value = nearestStandardDiameter(raw);
});
alloyEl.addEventListener('change', recompute);

addBtn.addEventListener('click', () => {
  if (!currentComputation) return;
  addHistoryRecord(localStorage, currentComputation.diameter, currentComputation.alloy, currentComputation.results);
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

renderEmpty();
```

- [ ] **Step 3: Manually verify in a browser**

Start a static server from the project root (ES module imports are blocked by CORS on `file://`):

```bash
npx serve .
```

Open the printed `http://localhost:...` URL, navigate to `tool.html`, and verify:
- Entering `8` with alloy `6061` shows a 3-row comparison table: HSS row reads 30–60 m/min / 51 m/min / 2,029 / 0.13 mm/rev / 254 mm/min; carbide row reads 150–300 m/min / 255 m/min / 10,146 / 1,268 mm/min; coated row reads 200–350 m/min / 305 m/min / 12,136 / 1,517 mm/min. (These exact numbers were confirmed against the unit tests during planning.)
- Entering `3.672` shows the hint "⚙ 3.672mm 非市售規格,已對應到最接近的 3.7 mm 計算" and recalculates using 3.7mm.
- Entering `40` clamps to 32mm on blur.
- Clicking "加入記錄" briefly shows "已加入 ✓" and no console error appears.

- [ ] **Step 4: Commit**

```bash
git add tool.html assets/ui/toolController.js
git commit -m "feat: add tool page with three-material comparison table"
```

---

### Task 10: History page — `history.html` + `ui/historyController.js` (操作)

**Files:**
- Create: `history.html`
- Create: `assets/ui/historyController.js`

**Interfaces:**
- Consumes: `loadHistory`, `deleteHistoryRecord`, `clearHistory` from `../data/historyStore.js`; `renderHistoryList` from `./historyView.js`.
- This file contains **no HTML-string building** — it only wires button clicks, calls the storage functions, and assigns `renderHistoryList`'s output to `innerHTML`.

- [ ] **Step 1: Create `history.html`**

```html
<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>歷史紀錄 - 鑽頭選擇系統</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/style.css">
</head>
<body>
<nav class="site-nav">
  <span class="brand">鑽頭選擇系統</span>
  <a href="index.html">首頁</a>
  <a href="tool.html">鑽頭選擇</a>
  <a href="history.html" aria-current="page">歷史紀錄</a>
</nav>

<div class="wrap">
  <header class="page">
    <h1>歷史紀錄</h1>
    <p>只保存在這個瀏覽器裡,換一台電腦或清除瀏覽器資料就看不到了</p>
  </header>

  <section class="panel" aria-label="歷史紀錄清單">
    <div class="confirm-bar" id="confirmBar" style="display:none;">
      確定要清空全部記錄嗎?此操作無法復原。
      <button class="btn-danger-ghost" id="confirmClearBtn">確定清空</button>
      <button class="btn-ghost" id="cancelClearBtn">取消</button>
    </div>

    <div class="history-list" id="historyList"></div>

    <div class="actions" style="justify-content: flex-start; margin-top: 16px;">
      <button class="btn-ghost" id="clearAllBtn">清空全部</button>
    </div>
  </section>
</div>

<script type="module" src="assets/ui/historyController.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `assets/ui/historyController.js`**

```js
import { loadHistory, deleteHistoryRecord, clearHistory } from '../data/historyStore.js';
import { renderHistoryList } from './historyView.js';

const historyList = document.getElementById('historyList');
const clearAllBtn = document.getElementById('clearAllBtn');
const confirmBar = document.getElementById('confirmBar');
const confirmClearBtn = document.getElementById('confirmClearBtn');
const cancelClearBtn = document.getElementById('cancelClearBtn');

function render() {
  historyList.innerHTML = renderHistoryList(loadHistory(localStorage));
}

historyList.addEventListener('click', (e) => {
  const btn = e.target.closest('.del-btn');
  if (!btn) return;
  deleteHistoryRecord(localStorage, btn.getAttribute('data-id'));
  render();
});

clearAllBtn.addEventListener('click', () => {
  confirmBar.style.display = 'flex';
});
cancelClearBtn.addEventListener('click', () => {
  confirmBar.style.display = 'none';
});
confirmClearBtn.addEventListener('click', () => {
  clearHistory(localStorage);
  confirmBar.style.display = 'none';
  render();
});

render();
```

- [ ] **Step 3: Manually verify in a browser**

With `npx serve .` still running:
- With no history, `history.html` shows the empty-state message.
- Go to `tool.html`, compute a result, click "加入記錄", then open `history.html` — the record appears with all three material rows and a readable timestamp.
- Click "刪除" on a record — it disappears immediately.
- Add two records, click "清空全部" — the confirm bar appears; click "取消" and both records remain; click "清空全部" again then "確定清空" — the list becomes empty.

- [ ] **Step 4: Commit**

```bash
git add history.html assets/ui/historyController.js
git commit -m "feat: add history page"
```

---

### Task 11: Home page

**Files:**
- Create: `index.html`

**Interfaces:**
- None (static page, links to `tool.html`).

- [ ] **Step 1: Create `index.html`**

```html
<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>鑽頭選擇系統</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/style.css">
</head>
<body>
<nav class="site-nav">
  <span class="brand">鑽頭選擇系統</span>
  <a href="index.html" aria-current="page">首頁</a>
  <a href="tool.html">鑽頭選擇</a>
  <a href="history.html">歷史紀錄</a>
</nav>

<div class="wrap">
  <header class="page">
    <h1>鑽頭選擇系統</h1>
    <p>鋁合金鑽孔的鑽頭材質比較與轉速/進給量計算工具</p>
  </header>

  <section class="panel">
    <p style="margin: 0 0 16px; color: var(--text); line-height: 1.8;">
      輸入鑽頭直徑與鋁合金材質,系統會同時算出高速鋼 HSS、硬質合金、塗層硬質合金三種鑽頭材質的建議轉速與進給量,方便比較選用。每次計算都可以存成記錄,方便之後回頭查對照。
    </p>
    <div class="actions" style="justify-content: flex-start;">
      <a class="btn-primary link-button" href="tool.html">開始使用鑽頭選擇工具</a>
    </div>
  </section>
</div>
</body>
</html>
```

- [ ] **Step 2: Manually verify in a browser**

With `npx serve .` still running, open the root URL and confirm the home page loads, the nav highlights "首頁", and clicking "開始使用鑽頭選擇工具" navigates to `tool.html`.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add home page"
```

---

### Task 12: Full local integration walkthrough

**Files:** None (verification only).

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`
Expected: PASS (24 tests, 0 failures)

- [ ] **Step 2: Walk the golden path end-to-end in a browser**

With `npx serve .` running from the project root:
1. Open the root URL → lands on `index.html`.
2. Click "開始使用鑽頭選擇工具" → lands on `tool.html`.
3. Enter diameter `8`, alloy `6061` → comparison table shows HSS/carbide/coated rows with the values verified in Task 9.
4. Click "加入記錄".
5. Change diameter to `12`, alloy `7075`, click "加入記錄" again.
6. Navigate to `history.html` via the nav bar → both records appear, newest (12mm/7075) first, each showing all three material rows.
7. Refresh the page (`F5`) → both records are still there (confirms `localStorage` persists across a reload on the same origin).
8. Delete one record → only the other remains after refresh.
9. Click "清空全部" → "確定清空" → list is empty after refresh.

- [ ] **Step 3: Check the browser console for errors**

Open browser dev tools on each of the three pages; confirm no uncaught errors or 404s (in particular, confirm the Google Fonts stylesheet, `assets/style.css`, and every `assets/core/*.js` / `assets/data/*.js` / `assets/ui/*.js` module load with 200 status).

- [ ] **Step 4: Commit any fixes found during the walkthrough**

If Steps 1–3 surface a bug, fix it in the file whose responsibility it belongs to (calculation bug → `core/`, storage bug → `data/`, wrong HTML → `*View.js`, wrong event wiring → `*Controller.js`), re-run `npm test` and the affected browser check, then commit with a message describing the fix (e.g. `fix: correct history record ordering`).

---

## After this plan

GitHub Pages deployment (creating/using a GitHub account, pushing this repo publicly, enabling Pages) is **out of scope for this plan** and will be done as a separate, explicitly-confirmed step once the site is verified locally, per the design spec.
