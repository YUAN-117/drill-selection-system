# 鑽頭選擇系統網站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 3-page static website (home, drill-selection tool, history) that recommends and compares HSS / carbide / coated-carbide drill parameters for aluminum drilling, replacing the single-page `drill-console.html` calculator.

**Architecture:** Pure ES-module logic in `assets/app.js` (diameter normalization, Vc/RPM/feed calculation, history storage) tested with Node's built-in test runner; thin DOM-wiring scripts (`assets/tool.js`, `assets/history.js`) that import that logic and are verified manually in a browser; shared `assets/style.css` for the visual design; no backend, no build step, no framework.

**Tech Stack:** Plain HTML/CSS/JavaScript (ES modules), Node.js built-in test runner (`node --test`), Google Fonts (Noto Sans TC + IBM Plex Mono), deployed later to GitHub Pages (separate step, not part of this plan).

**Spec:** [docs/superpowers/specs/2026-08-22-drill-selection-website-design.md](../specs/2026-08-22-drill-selection-website-design.md)

## Global Constraints

- Metric units only.
- Aluminum alloys only for now: `6061`, `7075`, `a380` (A380 壓鑄鋁), `custom` (自訂鋁合金).
- Drill diameter must snap to standard DIN 338-style sizes: 1.0–13.0mm every 0.1mm, 13.5–20.0mm every 0.5mm, 21–32mm every 1mm.
- No user-adjustable Vc/f sliders — these are computed, read-only reference values.
- Feed rate `f` depends only on diameter, not drill material (intentional simplification carried over from the spec).
- No login, no backend, no shared/cross-user data — history is per-browser `localStorage` only.
- No automated DOM/UI tests — pure logic gets unit tests; UI is verified manually in a browser.
- Every color in `assets/style.css` must be defined for both light and dark themes (reuse the token structure already validated in `drill-console.html`).

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `assets/` (empty directory, populated by later tasks)

**Interfaces:**
- Produces: `npm test` runs `node --test` (auto-discovers `**/*.test.js`) for all later tasks' test files.

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

- [ ] **Step 3: Create the `assets/` directory**

```bash
mkdir assets
```

- [ ] **Step 4: Commit**

```bash
git add package.json .gitignore assets
git commit -m "chore: scaffold drill selection website project"
```

---

### Task 2: Diameter normalization and feed-band lookup

**Files:**
- Create: `assets/app.js`
- Create: `assets/app.test.js`

**Interfaces:**
- Produces: `STANDARD_SIZES` (array of numbers), `nearestStandardDiameter(raw: number): number`, `FEED_BANDS` (array of `{dmax, fmin, fmax, def}`), `getFeedBand(diameter: number): {dmax, fmin, fmax, def}`.

- [ ] **Step 1: Write the failing tests**

Create `assets/app.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STANDARD_SIZES, nearestStandardDiameter, getFeedBand } from './app.js';

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

test('getFeedBand returns the 3-6mm band for 3.7mm', () => {
  assert.deepEqual(getFeedBand(3.7), { dmax: 6, fmin: 0.05, fmax: 0.10, def: 0.075 });
});

test('getFeedBand returns the 6-10mm band for 8mm', () => {
  assert.deepEqual(getFeedBand(8), { dmax: 10, fmin: 0.10, fmax: 0.15, def: 0.125 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `assets/app.js` does not exist yet (module not found).

- [ ] **Step 3: Write the implementation**

Create `assets/app.js`:

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add assets/app.js assets/app.test.js
git commit -m "feat: add diameter normalization and feed-band lookup logic"
```

---

### Task 3: Material Vc / RPM / feed-rate calculation

**Files:**
- Modify: `assets/app.js`
- Modify: `assets/app.test.js`

**Interfaces:**
- Consumes: `nearestStandardDiameter`, `getFeedBand` from Task 2.
- Produces: `DRILL_MATERIALS` (array of `{key, label, vcMin, vcMax}`), `ALLOY_BIAS` (object), `ALLOY_LABELS` (object), `computeVc(drillMatKey: string, alloyKey: string): number`, `computeResultForMaterial(diameter: number, alloyKey: string, drillMatKey: string): {drillMat, drillMatLabel, vc, f, rpm, feedRate}`, `computeAllResults(rawDiameter: number, alloyKey: string): {diameter: number, results: Array}`, `formatNumber(n: number, digits: number): string`.

- [ ] **Step 1: Write the failing tests**

Append to `assets/app.test.js`:

```js
import {
  computeVc,
  computeResultForMaterial,
  computeAllResults,
  formatNumber,
  DRILL_MATERIALS
} from './app.js';

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

test('formatNumber formats with a fixed number of decimal places and thousands separators', () => {
  assert.equal(formatNumber(2029, 0), '2,029');
  assert.equal(formatNumber(0.125, 2), '0.13');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `computeVc`, `computeResultForMaterial`, `computeAllResults`, `formatNumber`, `DRILL_MATERIALS` are not exported yet.

- [ ] **Step 3: Write the implementation**

Append to `assets/app.js`:

```js
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

export function formatNumber(n, digits) {
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (13 tests)

- [ ] **Step 5: Commit**

```bash
git add assets/app.js assets/app.test.js
git commit -m "feat: add Vc/RPM/feed-rate calculation for the three drill materials"
```

---

### Task 4: History storage logic

**Files:**
- Modify: `assets/app.js`
- Modify: `assets/app.test.js`

**Interfaces:**
- Consumes: `ALLOY_LABELS`, `computeAllResults` from Task 3.
- Produces: `HISTORY_STORAGE_KEY` (string), `loadHistory(storage): Array`, `saveHistory(storage, list): void`, `addHistoryRecord(storage, diameter: number, alloyKey: string, results: Array): Array`, `deleteHistoryRecord(storage, id: string): Array`, `clearHistory(storage): Array`. `storage` is any object implementing `getItem(key)`/`setItem(key, value)` (the browser's `localStorage`, or a test double).

- [ ] **Step 1: Write the failing tests**

Append to `assets/app.test.js`:

```js
import {
  HISTORY_STORAGE_KEY,
  loadHistory,
  saveHistory,
  addHistoryRecord,
  deleteHistoryRecord,
  clearHistory
} from './app.js';

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
Expected: FAIL — `HISTORY_STORAGE_KEY`, `loadHistory`, `saveHistory`, `addHistoryRecord`, `deleteHistoryRecord`, `clearHistory` are not exported yet.

- [ ] **Step 3: Write the implementation**

Append to `assets/app.js`:

```js
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
git add assets/app.js assets/app.test.js
git commit -m "feat: add per-browser history storage logic"
```

---

### Task 5: Shared stylesheet

**Files:**
- Create: `assets/style.css`

**Interfaces:**
- Produces: CSS custom properties and classes (`.wrap`, `nav.site-nav`, `.panel`, `.field-grid`/`.field`, `.compare-wrap`/`.compare-table`, `.params-line`, `.actions`, `button` variants, `.confirm-bar`, `.history-list`/`.history-record`, `.empty-state`, `footer.note`) consumed by Tasks 6–8.

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

### Task 6: Tool page (核心功能:鑽頭選擇與計算)

**Files:**
- Create: `tool.html`
- Create: `assets/tool.js`

**Interfaces:**
- Consumes: `STANDARD_SIZES`, `DRILL_MATERIALS`, `nearestStandardDiameter`, `computeAllResults`, `addHistoryRecord`, `formatNumber` from `assets/app.js`.

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

<script type="module" src="assets/tool.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `assets/tool.js`**

```js
import {
  STANDARD_SIZES,
  DRILL_MATERIALS,
  nearestStandardDiameter,
  computeAllResults,
  addHistoryRecord,
  formatNumber
} from './app.js';

const diameterEl = document.getElementById('diameter');
const alloyEl = document.getElementById('alloy');
const compareBody = document.getElementById('compareBody');
const diaHint = document.getElementById('diaHint');
const guidanceLine = document.getElementById('guidanceLine');
const addBtn = document.getElementById('addBtn');

function vcRangeLabel(drillMatKey) {
  const material = DRILL_MATERIALS.find((m) => m.key === drillMatKey);
  return material.vcMin + '–' + material.vcMax + ' m/min';
}

let currentComputation = null;

function renderEmpty() {
  compareBody.innerHTML =
    '<tr><td colspan="6" style="color: var(--readout-text-dim); padding: 20px 14px;">輸入直徑後顯示比較結果</td></tr>';
  diaHint.innerHTML = '&nbsp;';
  guidanceLine.textContent = '選擇材質並輸入直徑後,顯示選用原則';
  addBtn.disabled = true;
  currentComputation = null;
}

function renderResults(rawDiameter, alloyKey) {
  const { diameter, results } = computeAllResults(rawDiameter, alloyKey);

  if (Math.abs(rawDiameter - diameter) < 0.001) {
    diaHint.innerHTML = '✓ 市售標準鑽頭尺寸';
  } else {
    diaHint.innerHTML =
      '⚙ ' + rawDiameter + 'mm 非市售規格,已對應到最接近的 <strong>' + diameter + ' mm</strong> 計算';
  }

  compareBody.innerHTML = results
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

  guidanceLine.innerHTML =
    '一般用途或單件加工可選 <strong>高速鋼 HSS</strong>;長時間量產或需拉高轉速可選 <strong>硬質合金 / 塗層硬質合金</strong>。';

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
- Entering `8` with alloy `6061` shows a 3-row comparison table: HSS row reads 51 m/min / 2,029 RPM / 0.13 mm/rev / 254 mm/min; carbide row reads 255 m/min / 10,146 RPM; coated row reads 305 m/min / 12,136 RPM.
- Entering `3.672` shows the hint "⚙ 3.672mm 非市售規格,已對應到最接近的 3.7 mm 計算" and recalculates using 3.7mm.
- Entering `40` clamps to 32mm.
- Clicking "加入記錄" while a result is shown enables briefly shows "已加入 ✓" and does not throw a console error.

- [ ] **Step 4: Commit**

```bash
git add tool.html assets/tool.js
git commit -m "feat: add tool page with three-material comparison table"
```

---

### Task 7: History page

**Files:**
- Create: `history.html`
- Create: `assets/history.js`

**Interfaces:**
- Consumes: `loadHistory`, `deleteHistoryRecord`, `clearHistory`, `formatNumber` from `assets/app.js`.

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

<script type="module" src="assets/history.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `assets/history.js`**

```js
import { loadHistory, deleteHistoryRecord, clearHistory, formatNumber } from './app.js';

const historyList = document.getElementById('historyList');
const clearAllBtn = document.getElementById('clearAllBtn');
const confirmBar = document.getElementById('confirmBar');
const confirmClearBtn = document.getElementById('confirmClearBtn');
const cancelClearBtn = document.getElementById('cancelClearBtn');

function render() {
  const list = loadHistory(localStorage);
  if (list.length === 0) {
    historyList.innerHTML =
      '<div class="empty-state">尚無記錄,到「鑽頭選擇」頁計算後按「加入記錄」即可保存於此</div>';
    return;
  }

  historyList.innerHTML = list
    .map((record) => {
      const rows = record.results
        .map(
          (r) =>
            '<tr>' +
            '<td>' + r.drillMatLabel + '</td>' +
            '<td>' + formatNumber(r.rpm, 0) + ' RPM</td>' +
            '<td>' + formatNumber(r.f, 2) + ' mm/rev · ' + formatNumber(r.feedRate, 0) + ' mm/min</td>' +
            '</tr>'
        )
        .join('');
      const time = new Date(record.timestamp).toLocaleString('zh-TW');
      return (
        '<div class="history-record">' +
        '<div class="record-head">' +
        '<span class="record-title">' + record.diameter + 'mm · ' + record.alloyLabel + '</span>' +
        '<span class="record-time">' + time + '</span>' +
        '<button class="del-btn btn-ghost" data-id="' + record.id + '">刪除</button>' +
        '</div>' +
        '<table><thead><tr><th>材質</th><th>轉速</th><th>進給量</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        '</div>'
      );
    })
    .join('');
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
git add history.html assets/history.js
git commit -m "feat: add history page"
```

---

### Task 8: Home page

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

### Task 9: Full local integration walkthrough

**Files:** None (verification only).

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`
Expected: PASS (19 tests, 0 failures)

- [ ] **Step 2: Walk the golden path end-to-end in a browser**

With `npx serve .` running from the project root:
1. Open the root URL → lands on `index.html`.
2. Click "開始使用鑽頭選擇工具" → lands on `tool.html`.
3. Enter diameter `8`, alloy `6061` → comparison table shows HSS/carbide/coated rows with the values verified in Task 6.
4. Click "加入記錄".
5. Change diameter to `12`, alloy `7075`, click "加入記錄" again.
6. Navigate to `history.html` via the nav bar → both records appear, newest (12mm/7075) first, each showing all three material rows.
7. Refresh the page (`F5`) → both records are still there (confirms `localStorage` persists across a reload on the same origin).
8. Delete one record → only the other remains after refresh.
9. Click "清空全部" → "確定清空" → list is empty after refresh.

- [ ] **Step 3: Check the browser console for errors**

Open browser dev tools on each of the three pages; confirm no uncaught errors or 404s (in particular, confirm the Google Fonts stylesheet and `assets/app.js`/`assets/style.css` all load with 200 status).

- [ ] **Step 4: Commit any fixes found during the walkthrough**

If Steps 1–3 surface a bug, fix it, re-run `npm test` and the affected browser check, then commit with a message describing the fix (e.g. `fix: correct history record ordering`).

---

## After this plan

GitHub Pages deployment (creating/using a GitHub account, pushing this repo publicly, enabling Pages) is **out of scope for this plan** and will be done as a separate, explicitly-confirmed step once the site is verified locally, per the design spec.
