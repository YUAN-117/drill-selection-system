# 歷史紀錄雲端同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 已登入 Google 帳號的使用者,計算歷史紀錄改存到 Supabase 資料庫並跨裝置同步;未登入沿用現有 localStorage 行為不受影響。

**Architecture:** 新增一張有 RLS 保護的 Supabase 資料表 `drill_history`,搭配一個新的 async `cloudHistoryStore.js`(對應現有同步的 `historyStore.js`)。新增一個 `historyGateway.js` 分流層,依 `session` 有無決定呼叫本機還是雲端的存取函式,`historyController.js` 和 `toolController.js` 只透過這層呼叫,不直接碰 `historyStore.js`/`cloudHistoryStore.js`。`historyView.js` 新增載入中/錯誤狀態的純渲染函式。`history.html` 新增登入狀態列與錯誤提示區塊。

**Tech Stack:** Plain ES modules(無建置流程)、`@supabase/supabase-js@2`(既有的 `assets/data/supabaseClient.js`)、Node 內建 `node:test`、Playwright(手動瀏覽器 E2E)。

**Spec:** `docs/superpowers/specs/2026-09-12-history-cloud-sync-design.md`

## Global Constraints

- 所有使用者可見文字一律用繁體中文
- 不憑空捏造精確數字/行為——錯誤訊息只描述「失敗、請重試」,不編造具體原因
- `assets/data/historyStore.js` 這次完全不動,維持純同步 `localStorage` 實作
- `assets/data/cloudHistoryStore.js`、`assets/data/historyGateway.js` 的每個函式都是 async,失敗時用 `throw`(不是回傳錯誤物件),由呼叫端 `try/catch`
- `historyGateway.js` 的函式一律以 `(session, storage, supabase, ...)` 作為前綴參數,`storage`/`supabase` 用依賴注入方式傳入(不在模組內直接 `import` 使用),這樣才能在單元測試中用假物件替換,不需要真的連 localStorage/Supabase
- 資料表 RLS 一律鎖 `auth.uid() = user_id`,沒有 `update` policy(紀錄不可修改,只能新增/刪除)
- 不設歷史紀錄筆數上限
- 不搬移登入前的本機舊紀錄到雲端
- `assets/ui/*Controller.js`、`*.html` 的改動只做手動/Playwright 瀏覽器驗證,不寫 `node:test` 單元測試(既有慣例);`assets/data/*.js`、`assets/ui/*View.js` 的改動一定要有對應單元測試
- Windows 測試環境下 `node --test` 可能因為 sandbox 限制出現 `spawn EPERM`,遇到時改用 `node <path-to-test-file>.js` 直接執行

---

### Task 1: Supabase migration — `drill_history` 資料表

**Files:**
- Create: `supabase/migrations/20260912000000_create_drill_history.sql`

**Interfaces:**
- Produces: Postgres 資料表 `public.drill_history(id bigint, user_id uuid, created_at timestamptz, record jsonb)`,之後所有任務都靠這張表

- [ ] **Step 1: 建立 migration 檔案**

```sql
-- Stores one row per saved drill-selection history record for a signed-in
-- user. `record` holds the full record object (diameter, material, drill
-- type, computed result, etc.) as JSON, mirroring the shape historyStore.js
-- already uses for localStorage — no separate columns per field.
create table if not exists public.drill_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  record jsonb not null
);

create index if not exists drill_history_user_id_created_at_idx
  on public.drill_history (user_id, created_at desc);

alter table public.drill_history enable row level security;

create policy "Users can view their own history"
  on public.drill_history for select
  using (auth.uid() = user_id);

create policy "Users can insert their own history"
  on public.drill_history for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own history"
  on public.drill_history for delete
  using (auth.uid() = user_id);
```

- [ ] **Step 2: 部署到 Supabase**

Run: `npx supabase db push`

專案已經在 `supabase/.temp/linked-project.json` 連結過(project ref `eefnzpqveljowridmhto`),如果指令要求登入,需要使用者提供 Supabase Personal Access Token(比照先前部署 Edge Function 的方式,請使用者自己貼上,不要主動索取或寫進任何檔案)。

Expected: 指令回報 migration 套用成功,或已經是最新狀態。

- [ ] **Step 3: 在 Supabase Dashboard 確認資料表存在**

到 Table Editor 確認 `drill_history` 資料表已建立、RLS 已啟用、三條 policy 都在。

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260912000000_create_drill_history.sql
git commit -m "feat: add drill_history table with per-user RLS policies"
```

---

### Task 2: `cloudHistoryStore.js` — `loadCloudHistory`

**Files:**
- Create: `assets/data/cloudHistoryStore.js`
- Test: `assets/data/cloudHistoryStore.test.js`

**Interfaces:**
- Consumes: 無(這是最底層的新模組)
- Produces: `loadCloudHistory(supabase, userId)` → `Promise<Array<Record>>`,`Record` 形狀跟 `historyStore.js` 的紀錄物件一致(`{id, timestamp, diameter, materialKey, subtypeKey, materialLabel, drillMat, drillMatLabel, depth, deepHoleWarning, result}`),供 Task 3/4/5 使用同一份檔案與測試裡的 `createFakeSupabase` 輔助函式

- [ ] **Step 1: 寫失敗的測試**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCloudHistory } from './cloudHistoryStore.js';

function createFakeSupabase({ data, error }) {
  const builder = {
    select: () => builder,
    insert: () => builder,
    delete: () => builder,
    eq: () => builder,
    order: () => builder,
    single: () => Promise.resolve({ data, error }),
    then: (resolve) => resolve({ data, error })
  };
  return { from: () => builder };
}

test('loadCloudHistory maps Supabase rows into record objects', async () => {
  const supabase = createFakeSupabase({
    data: [
      {
        id: 7,
        created_at: '2026-09-12T03:00:00.000Z',
        record: { diameter: 8, materialKey: 'aluminum', subtypeKey: '6061', materialLabel: '6061', drillMat: 'hss', drillMatLabel: '高速鋼 HSS', depth: null, deepHoleWarning: null, result: { rpm: 2029 } }
      }
    ],
    error: null
  });
  const list = await loadCloudHistory(supabase, 'user-1');
  assert.equal(list.length, 1);
  assert.equal(list[0].id, '7');
  assert.equal(list[0].timestamp, '2026-09-12T03:00:00.000Z');
  assert.equal(list[0].diameter, 8);
  assert.equal(list[0].materialLabel, '6061');
  assert.equal(list[0].result.rpm, 2029);
});

test('loadCloudHistory throws when Supabase returns an error', async () => {
  const supabase = createFakeSupabase({ data: null, error: { message: 'network error' } });
  await assert.rejects(() => loadCloudHistory(supabase, 'user-1'));
});
```

- [ ] **Step 2: 執行測試,確認失敗**

Run: `node assets/data/cloudHistoryStore.test.js`
Expected: FAIL,因為 `cloudHistoryStore.js` 還不存在

- [ ] **Step 3: 寫最小實作**

```js
const TABLE = 'drill_history';

function rowToRecord(row) {
  return { id: String(row.id), timestamp: row.created_at, ...row.record };
}

export async function loadCloudHistory(supabase, userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(rowToRecord);
}
```

- [ ] **Step 4: 執行測試,確認通過**

Run: `node assets/data/cloudHistoryStore.test.js`
Expected: PASS(2 個測試)

- [ ] **Step 5: Commit**

```bash
git add assets/data/cloudHistoryStore.js assets/data/cloudHistoryStore.test.js
git commit -m "feat: add loadCloudHistory for Supabase-backed history reads"
```

---

### Task 3: `cloudHistoryStore.js` — `addCloudHistoryRecord`

**Files:**
- Modify: `assets/data/cloudHistoryStore.js`
- Modify: `assets/data/cloudHistoryStore.test.js`

**Interfaces:**
- Consumes: `WORKPIECE_MATERIALS` from `assets/core/materials.js`(跟 `historyStore.js` 的 `addHistoryRecord` 用同一份資料查材料標籤)
- Produces: `addCloudHistoryRecord(supabase, userId, diameter, materialKey, subtypeKey, drillToolType, result, depth)` → `Promise<Record>`,回傳值形狀跟 `loadCloudHistory` 回傳的元素一致,供 Task 5 的 `historyGateway.addRecord` 使用

- [ ] **Step 1: 寫失敗的測試**

在 `assets/data/cloudHistoryStore.test.js` 加入:

```js
import { computeResult } from '../core/materials.js';
import { loadCloudHistory, addCloudHistoryRecord } from './cloudHistoryStore.js';
```

（把原本的 `import { loadCloudHistory } from './cloudHistoryStore.js';` 換成上面這行合併匯入）

```js
test('addCloudHistoryRecord inserts a record shaped like the local store and returns it mapped back', async () => {
  const result = computeResult(8, 'aluminum', '6061', 'hss');
  const supabase = createFakeSupabase({
    data: {
      id: 12,
      created_at: '2026-09-12T04:00:00.000Z',
      record: {
        diameter: 8,
        materialKey: 'aluminum',
        subtypeKey: '6061',
        materialLabel: '6061',
        drillMat: 'hss',
        drillMatLabel: result.drillMatLabel,
        depth: null,
        deepHoleWarning: null,
        result
      }
    },
    error: null
  });
  const record = await addCloudHistoryRecord(supabase, 'user-1', 8, 'aluminum', '6061', 'hss', result);
  assert.equal(record.id, '12');
  assert.equal(record.materialLabel, '6061');
  assert.equal(record.drillMat, 'hss');
  assert.equal(record.depth, null);
  assert.equal(record.result.rpm, result.rpm);
});

test('addCloudHistoryRecord throws when Supabase returns an error', async () => {
  const result = computeResult(8, 'aluminum', '6061', 'hss');
  const supabase = createFakeSupabase({ data: null, error: { message: 'insert failed' } });
  await assert.rejects(() => addCloudHistoryRecord(supabase, 'user-1', 8, 'aluminum', '6061', 'hss', result));
});
```

- [ ] **Step 2: 執行測試,確認失敗**

Run: `node assets/data/cloudHistoryStore.test.js`
Expected: FAIL,因為 `addCloudHistoryRecord` 還不存在

- [ ] **Step 3: 寫最小實作**

在 `assets/data/cloudHistoryStore.js` 頂部加入 import,並新增函式:

```js
import { WORKPIECE_MATERIALS } from '../core/materials.js';
```

```js
export async function addCloudHistoryRecord(supabase, userId, diameter, materialKey, subtypeKey, drillToolType, result, depth) {
  const subtype = WORKPIECE_MATERIALS[materialKey].subtypes[subtypeKey];
  const record = {
    diameter,
    materialKey,
    subtypeKey,
    materialLabel: subtype.label,
    drillMat: drillToolType,
    drillMatLabel: result.drillMatLabel,
    depth: depth ?? null,
    deepHoleWarning: result.deepHoleWarning ?? null,
    result
  };
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ user_id: userId, record })
    .select()
    .single();
  if (error) throw error;
  return rowToRecord(data);
}
```

- [ ] **Step 4: 執行測試,確認通過**

Run: `node assets/data/cloudHistoryStore.test.js`
Expected: PASS(4 個測試)

- [ ] **Step 5: Commit**

```bash
git add assets/data/cloudHistoryStore.js assets/data/cloudHistoryStore.test.js
git commit -m "feat: add addCloudHistoryRecord for Supabase-backed history writes"
```

---

### Task 4: `cloudHistoryStore.js` — `deleteCloudHistoryRecord` 與 `clearCloudHistory`

**Files:**
- Modify: `assets/data/cloudHistoryStore.js`
- Modify: `assets/data/cloudHistoryStore.test.js`

**Interfaces:**
- Produces: `deleteCloudHistoryRecord(supabase, userId, id)` → `Promise<void>`、`clearCloudHistory(supabase, userId)` → `Promise<void>`,兩者失敗都 `throw`,供 Task 5 的 `historyGateway.deleteRecord`/`clearRecords` 使用

- [ ] **Step 1: 寫失敗的測試**

在 `assets/data/cloudHistoryStore.test.js` 把 import 改成:

```js
import { loadCloudHistory, addCloudHistoryRecord, deleteCloudHistoryRecord, clearCloudHistory } from './cloudHistoryStore.js';
```

加入:

```js
test('deleteCloudHistoryRecord resolves when Supabase reports no error', async () => {
  const supabase = createFakeSupabase({ data: null, error: null });
  await assert.doesNotReject(() => deleteCloudHistoryRecord(supabase, 'user-1', '12'));
});

test('deleteCloudHistoryRecord throws when Supabase returns an error', async () => {
  const supabase = createFakeSupabase({ data: null, error: { message: 'delete failed' } });
  await assert.rejects(() => deleteCloudHistoryRecord(supabase, 'user-1', '12'));
});

test('clearCloudHistory resolves when Supabase reports no error', async () => {
  const supabase = createFakeSupabase({ data: null, error: null });
  await assert.doesNotReject(() => clearCloudHistory(supabase, 'user-1'));
});

test('clearCloudHistory throws when Supabase returns an error', async () => {
  const supabase = createFakeSupabase({ data: null, error: { message: 'clear failed' } });
  await assert.rejects(() => clearCloudHistory(supabase, 'user-1'));
});
```

- [ ] **Step 2: 執行測試,確認失敗**

Run: `node assets/data/cloudHistoryStore.test.js`
Expected: FAIL,因為兩個函式都還不存在

- [ ] **Step 3: 寫最小實作**

在 `assets/data/cloudHistoryStore.js` 加入:

```js
export async function deleteCloudHistoryRecord(supabase, userId, id) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function clearCloudHistory(supabase, userId) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('user_id', userId);
  if (error) throw error;
}
```

- [ ] **Step 4: 執行測試,確認通過**

Run: `node assets/data/cloudHistoryStore.test.js`
Expected: PASS(8 個測試)

- [ ] **Step 5: Commit**

```bash
git add assets/data/cloudHistoryStore.js assets/data/cloudHistoryStore.test.js
git commit -m "feat: add deleteCloudHistoryRecord and clearCloudHistory"
```

---

### Task 5: `historyGateway.js` — 本機/雲端分流層

**Files:**
- Create: `assets/data/historyGateway.js`
- Test: `assets/data/historyGateway.test.js`

**Interfaces:**
- Consumes: `loadHistory`/`addHistoryRecord`/`deleteHistoryRecord`/`clearHistory` from `assets/data/historyStore.js`(未改動);`loadCloudHistory`/`addCloudHistoryRecord`/`deleteCloudHistoryRecord`/`clearCloudHistory` from `assets/data/cloudHistoryStore.js`(Task 2-4)
- Produces:
  - `loadRecords(session, storage, supabase)` → `Promise<Array<Record>>`
  - `addRecord(session, storage, supabase, diameter, materialKey, subtypeKey, drillToolType, result, depth)` → `Promise<Record>`
  - `deleteRecord(session, storage, supabase, id)` → `Promise<void>`
  - `clearRecords(session, storage, supabase)` → `Promise<void>`
  
  所有四個函式:`session` 為 `null`/`undefined` 時走 `storage`(本機),否則走 `supabase`(雲端,用 `session.user.id` 當 `userId`)。供 Task 7(`historyController.js`)、Task 8(`toolController.js`)使用

- [ ] **Step 1: 寫失敗的測試**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeResult } from '../core/materials.js';
import { addHistoryRecord } from './historyStore.js';
import { loadRecords, addRecord, deleteRecord, clearRecords } from './historyGateway.js';

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, value)
  };
}

function createFakeSupabase({ data, error }) {
  const builder = {
    select: () => builder,
    insert: () => builder,
    delete: () => builder,
    eq: () => builder,
    order: () => builder,
    single: () => Promise.resolve({ data, error }),
    then: (resolve) => resolve({ data, error })
  };
  return { from: () => builder };
}

test('loadRecords reads from local storage when there is no session', async () => {
  const storage = createMemoryStorage();
  const result = computeResult(8, 'aluminum', '6061', 'hss');
  addHistoryRecord(storage, 8, 'aluminum', '6061', 'hss', result);
  const list = await loadRecords(null, storage, null);
  assert.equal(list.length, 1);
  assert.equal(list[0].diameter, 8);
});

test('loadRecords reads from Supabase when a session is present', async () => {
  const session = { user: { id: 'user-1' } };
  const supabase = createFakeSupabase({
    data: [{ id: 3, created_at: '2026-09-12T05:00:00.000Z', record: { diameter: 10, materialKey: 'aluminum' } }],
    error: null
  });
  const list = await loadRecords(session, null, supabase);
  assert.equal(list.length, 1);
  assert.equal(list[0].diameter, 10);
});

test('addRecord writes to local storage when there is no session', async () => {
  const storage = createMemoryStorage();
  const result = computeResult(8, 'aluminum', '6061', 'hss');
  const record = await addRecord(null, storage, null, 8, 'aluminum', '6061', 'hss', result);
  assert.equal(record.diameter, 8);
  assert.equal(JSON.parse(storage.getItem('drillSelectionHistory_v1')).length, 1);
});

test('addRecord writes to Supabase when a session is present', async () => {
  const session = { user: { id: 'user-1' } };
  const result = computeResult(8, 'aluminum', '6061', 'hss');
  const supabase = createFakeSupabase({
    data: { id: 9, created_at: '2026-09-12T06:00:00.000Z', record: { diameter: 8, materialKey: 'aluminum', subtypeKey: '6061', materialLabel: '6061', drillMat: 'hss', drillMatLabel: result.drillMatLabel, depth: null, deepHoleWarning: null, result } },
    error: null
  });
  const record = await addRecord(session, null, supabase, 8, 'aluminum', '6061', 'hss', result);
  assert.equal(record.id, '9');
});

test('deleteRecord deletes from local storage when there is no session', async () => {
  const storage = createMemoryStorage();
  const result = computeResult(8, 'aluminum', '6061', 'hss');
  addHistoryRecord(storage, 8, 'aluminum', '6061', 'hss', result);
  const [{ id }] = JSON.parse(storage.getItem('drillSelectionHistory_v1'));
  await deleteRecord(null, storage, null, id);
  assert.equal(JSON.parse(storage.getItem('drillSelectionHistory_v1')).length, 0);
});

test('deleteRecord deletes from Supabase when a session is present', async () => {
  const session = { user: { id: 'user-1' } };
  const supabase = createFakeSupabase({ data: null, error: null });
  await assert.doesNotReject(() => deleteRecord(session, null, supabase, '9'));
});

test('clearRecords clears local storage when there is no session', async () => {
  const storage = createMemoryStorage();
  const result = computeResult(8, 'aluminum', '6061', 'hss');
  addHistoryRecord(storage, 8, 'aluminum', '6061', 'hss', result);
  await clearRecords(null, storage, null);
  assert.equal(JSON.parse(storage.getItem('drillSelectionHistory_v1')).length, 0);
});

test('clearRecords clears Supabase when a session is present', async () => {
  const session = { user: { id: 'user-1' } };
  const supabase = createFakeSupabase({ data: null, error: null });
  await assert.doesNotReject(() => clearRecords(session, null, supabase));
});
```

- [ ] **Step 2: 執行測試,確認失敗**

Run: `node assets/data/historyGateway.test.js`
Expected: FAIL,因為 `historyGateway.js` 還不存在

- [ ] **Step 3: 寫最小實作**

```js
import { loadHistory, addHistoryRecord, deleteHistoryRecord, clearHistory } from './historyStore.js';
import { loadCloudHistory, addCloudHistoryRecord, deleteCloudHistoryRecord, clearCloudHistory } from './cloudHistoryStore.js';

export async function loadRecords(session, storage, supabase) {
  if (!session) return loadHistory(storage);
  return loadCloudHistory(supabase, session.user.id);
}

export async function addRecord(session, storage, supabase, diameter, materialKey, subtypeKey, drillToolType, result, depth) {
  if (!session) {
    const list = addHistoryRecord(storage, diameter, materialKey, subtypeKey, drillToolType, result, depth);
    return list[0];
  }
  return addCloudHistoryRecord(supabase, session.user.id, diameter, materialKey, subtypeKey, drillToolType, result, depth);
}

export async function deleteRecord(session, storage, supabase, id) {
  if (!session) {
    deleteHistoryRecord(storage, id);
    return;
  }
  return deleteCloudHistoryRecord(supabase, session.user.id, id);
}

export async function clearRecords(session, storage, supabase) {
  if (!session) {
    clearHistory(storage);
    return;
  }
  return clearCloudHistory(supabase, session.user.id);
}
```

- [ ] **Step 4: 執行測試,確認通過**

Run: `node assets/data/historyGateway.test.js`
Expected: PASS(8 個測試)

- [ ] **Step 5: Commit**

```bash
git add assets/data/historyGateway.js assets/data/historyGateway.test.js
git commit -m "feat: add historyGateway to route history reads/writes by session"
```

---

### Task 6: `historyView.js` — 載入中 / 錯誤狀態渲染

**Files:**
- Modify: `assets/ui/historyView.js`
- Modify: `assets/ui/historyView.test.js`(若不存在則新建)

**Interfaces:**
- Produces: `LOADING_STATE_HTML`(字串常數)、`renderLoadErrorHtml(message)`(純函式,回傳字串),供 Task 7 的 `historyController.js` 使用

- [ ] **Step 1: 檢查現有測試檔是否存在**

Run: `ls assets/ui/historyView.test.js`(不存在的話下一步直接新建檔案,已存在的話在既有檔案後面加測試)

- [ ] **Step 2: 寫失敗的測試**

在 `assets/ui/historyView.test.js` 加入(若新建檔案,先加 `import { test } from 'node:test'; import assert from 'node:assert/strict';`):

```js
import { LOADING_STATE_HTML, renderLoadErrorHtml } from './historyView.js';

test('LOADING_STATE_HTML shows a loading message', () => {
  assert.ok(LOADING_STATE_HTML.includes('載入中'));
});

test('renderLoadErrorHtml renders the given error message', () => {
  const html = renderLoadErrorHtml('無法載入雲端紀錄,請檢查網路連線後重新整理');
  assert.ok(html.includes('無法載入雲端紀錄,請檢查網路連線後重新整理'));
});
```

- [ ] **Step 3: 執行測試,確認失敗**

Run: `node assets/ui/historyView.test.js`
Expected: FAIL,因為 `LOADING_STATE_HTML`/`renderLoadErrorHtml` 還不存在

- [ ] **Step 4: 寫最小實作**

在 `assets/ui/historyView.js` 的 `EMPTY_STATE_HTML` 常數下方加入:

```js
export const LOADING_STATE_HTML = '<div class="empty-state">載入中...</div>';

export function renderLoadErrorHtml(message) {
  return '<div class="empty-state">' + message + '</div>';
}
```

- [ ] **Step 5: 執行測試,確認通過**

Run: `node assets/ui/historyView.test.js`
Expected: PASS(所有測試,含既有的)

- [ ] **Step 6: Commit**

```bash
git add assets/ui/historyView.js assets/ui/historyView.test.js
git commit -m "feat: add loading and load-error states to historyView"
```

---

### Task 7: `history.html` + `historyController.js` — 登入感知渲染與錯誤提示

**Files:**
- Modify: `history.html`
- Modify: `assets/ui/historyController.js`

**Interfaces:**
- Consumes: `getSession`/`signInWithGoogle`/`onAuthStateChange`/`supabase` from `assets/data/supabaseClient.js`;`loadRecords`/`deleteRecord`/`clearRecords` from `assets/data/historyGateway.js`(Task 5);`renderHistoryList`/`LOADING_STATE_HTML`/`renderLoadErrorHtml` from `assets/ui/historyView.js`(Task 6);`renderLoginStatus` from `assets/ui/voiceInputView.js`(既有,不改)

- [ ] **Step 1: 修改 `history.html`**

把整個 `<div class="wrap">...</div>` 區塊換成:

```html
<div class="wrap">
  <header class="page">
    <h1>歷史紀錄</h1>
    <p id="historyDesc">只保存在這個瀏覽器裡,換一台電腦或清除瀏覽器資料就看不到了</p>
  </header>

  <section class="panel" aria-label="歷史紀錄清單">
    <div class="login-status">
      <span id="loginStatus">檢查登入狀態...</span>
      <button class="btn-ghost" id="loginBtn" type="button">使用 Google 登入</button>
    </div>

    <div class="confirm-bar" id="historyError" style="display:none;"></div>

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
```

- [ ] **Step 2: 重寫 `historyController.js`**

```js
import { getSession, signInWithGoogle, onAuthStateChange, supabase } from '../data/supabaseClient.js';
import { loadRecords, deleteRecord, clearRecords } from '../data/historyGateway.js';
import { renderHistoryList, LOADING_STATE_HTML, renderLoadErrorHtml } from './historyView.js';
import { renderLoginStatus } from './voiceInputView.js';

const historyList = document.getElementById('historyList');
const clearAllBtn = document.getElementById('clearAllBtn');
const confirmBar = document.getElementById('confirmBar');
const confirmClearBtn = document.getElementById('confirmClearBtn');
const cancelClearBtn = document.getElementById('cancelClearBtn');
const historyError = document.getElementById('historyError');
const historyDesc = document.getElementById('historyDesc');
const loginBtn = document.getElementById('loginBtn');
const loginStatus = document.getElementById('loginStatus');

let currentSession = null;

function setError(message) {
  if (!message) {
    historyError.style.display = 'none';
    historyError.textContent = '';
    return;
  }
  historyError.textContent = message;
  historyError.style.display = 'flex';
}

function updateDesc() {
  historyDesc.textContent = currentSession
    ? '已同步到雲端,登入同一個帳號就能在其他裝置看到'
    : '只保存在這個瀏覽器裡,換一台電腦或清除瀏覽器資料就看不到了';
}

async function render() {
  updateDesc();
  historyList.innerHTML = LOADING_STATE_HTML;
  try {
    const list = await loadRecords(currentSession, localStorage, supabase);
    historyList.innerHTML = renderHistoryList(list);
  } catch {
    historyList.innerHTML = renderLoadErrorHtml('無法載入雲端紀錄,請檢查網路連線後重新整理');
  }
}

historyList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.del-btn');
  if (!btn) return;
  try {
    await deleteRecord(currentSession, localStorage, supabase, btn.getAttribute('data-id'));
    setError(null);
    render();
  } catch {
    setError('刪除失敗,請稍後再試');
  }
});

clearAllBtn.addEventListener('click', () => { confirmBar.style.display = 'flex'; });
cancelClearBtn.addEventListener('click', () => { confirmBar.style.display = 'none'; });
confirmClearBtn.addEventListener('click', async () => {
  confirmBar.style.display = 'none';
  try {
    await clearRecords(currentSession, localStorage, supabase);
    setError(null);
    render();
  } catch {
    setError('清空失敗,請稍後再試');
  }
});

function updateLoginUi(session) {
  currentSession = session;
  const { label, showLoginButton } = renderLoginStatus(session);
  loginStatus.textContent = label;
  loginBtn.style.display = showLoginButton ? '' : 'none';
  render();
}

loginBtn.addEventListener('click', () => {
  signInWithGoogle();
});

onAuthStateChange(updateLoginUi);
getSession().then(updateLoginUi);
```

- [ ] **Step 3: 手動瀏覽器驗證(未登入路徑)**

啟動本機伺服器(`npx serve -l 5050 .`),開 `http://localhost:5050/history.html`:
- 確認顯示「未登入」+「使用 Google 登入」按鈕
- 確認說明文字是「只保存在這個瀏覽器裡...」
- 確認既有的本機紀錄(在 `tool.html` 用「加入記錄」加過的)還是照常顯示、刪除、清空
- 確認 Console 沒有錯誤

- [ ] **Step 4: Commit**

```bash
git add history.html assets/ui/historyController.js
git commit -m "feat: make history page session-aware with cloud sync and error states"
```

---

### Task 8: `toolController.js` — 登入感知的「加入記錄」

**Files:**
- Modify: `assets/ui/toolController.js`

**Interfaces:**
- Consumes: `getSession`/`supabase` from `assets/data/supabaseClient.js`;`addRecord` from `assets/data/historyGateway.js`(Task 5)

- [ ] **Step 1: 換掉匯入**

把:

```js
import { addHistoryRecord } from '../data/historyStore.js';
```

換成:

```js
import { getSession, supabase } from '../data/supabaseClient.js';
import { addRecord } from '../data/historyGateway.js';
```

- [ ] **Step 2: 改寫 `addBtn` 點擊事件**

把現有的:

```js
addBtn.addEventListener('click', () => {
  if (!currentComputation) return;
  const { diameter, materialKey, subtypeKey, drillToolType, depth, result } = currentComputation;
  addHistoryRecord(localStorage, diameter, materialKey, subtypeKey, drillToolType, result, depth);
  addBtn.textContent = '已加入 ✓';
  setTimeout(() => {
    addBtn.textContent = '加入記錄';
  }, 1200);
});
```

換成:

```js
addBtn.addEventListener('click', async () => {
  if (!currentComputation) return;
  const { diameter, materialKey, subtypeKey, drillToolType, depth, result } = currentComputation;
  addBtn.disabled = true;
  addBtn.textContent = '加入中...';
  try {
    const session = await getSession();
    await addRecord(session, localStorage, supabase, diameter, materialKey, subtypeKey, drillToolType, result, depth);
    addBtn.textContent = '已加入 ✓';
  } catch {
    addBtn.textContent = '加入失敗,請重試';
  } finally {
    setTimeout(() => {
      addBtn.textContent = '加入記錄';
      addBtn.disabled = false;
    }, 1200);
  }
});
```

- [ ] **Step 3: 手動瀏覽器驗證**

開 `http://localhost:5050/tool.html`,計算一筆結果後點「加入記錄」:
- 按鈕依序顯示「加入中...」→「已加入 ✓」→ 恢復「加入記錄」
- 到 `history.html` 確認這筆紀錄真的出現(未登入狀態下,即本機路徑)
- Console 沒有錯誤

- [ ] **Step 4: Commit**

```bash
git add assets/ui/toolController.js
git commit -m "feat: make add-to-history button session-aware with loading/error states"
```

---

### Task 9: 端對端驗證與文件收尾

**Files:**
- Create(暫存,不進 repo): Playwright 驗證腳本(放在 scratchpad 目錄)
- Modify: `HANDOFF.md`

**Interfaces:**
- 無新介面,純驗證與文件更新

- [ ] **Step 1: 寫 Playwright 腳本驗證未登入(本機)路徑的回歸測試**

腳本涵蓋:開 `tool.html` 計算一筆結果、點「加入記錄」、確認按鈕文字狀態變化、跳到 `history.html` 確認紀錄出現、刪除、確認消失、清空全部、確認回到空清單提示;全程監聽 console error / pageerror,確認沒有噴錯。用 `chromium.launch({ args: ['--no-sandbox'] })`(這個 Windows sandbox 環境的既有解法)。

- [ ] **Step 2: 執行腳本,確認全部通過**

Run: `node <腳本路徑>`
Expected: 所有檢查點都是 OK,沒有 JS 錯誤

- [ ] **Step 3: 手動驗證登入(雲端)路徑**

這段無法自動化(需要真的用 Google 帳號登入),請使用者在瀏覽器手動操作並回報結果:
1. 到 `history.html` 或 `tool.html` 用 Google 登入
2. 確認 `history.html` 說明文字變成「已同步到雲端...」
3. 在 `tool.html` 加入一筆記錄,確認按鈕狀態正常、`history.html` 看得到這筆(帶 Supabase 產生的紀錄)
4. 刪除這筆紀錄,確認從 Supabase 消失(重新整理頁面後仍然消失,不是只有畫面上消失)
5. 清空全部,確認畫面回到空清單提示
6. 登出,確認畫面切回本機模式(未登入的舊 localStorage 紀錄,不是空的)

- [ ] **Step 4: 更新 `HANDOFF.md`**

在 `HANDOFF.md` 標記歷史紀錄雲端同步功能已完成上線,並記錄任何驗證時發現的問題與其修法(若有)。

- [ ] **Step 5: 確認推送**

跟使用者確認後 `git push origin master`。

- [ ] **Step 6: Commit(若 Step 4 有變更)**

```bash
git add HANDOFF.md
git commit -m "docs: mark history cloud sync complete and shipped"
```

---

## Self-Review

**Spec coverage:** 資料庫 schema+RLS(Task 1)、`cloudHistoryStore.js` 四個函式(Task 2-4)、`historyGateway.js` 分流(Task 5)、載入中/錯誤渲染(Task 6)、`history.html`+`historyController.js` 的登入列/錯誤提示/動態說明文字(Task 7)、`toolController.js` 的加入記錄錯誤狀態(Task 8)、E2E 驗證+手動雲端驗證+文件收尾(Task 9)——spec 的每個章節都有對應任務,沒有遺漏。範圍外項目(不搬遷舊紀錄、不設上限、不同步語音記錄)這次計畫也沒有實作對應功能,符合 spec。

**Placeholder scan:** 每個 Step 都是可直接執行的完整程式碼或明確指令,沒有 `TBD`/「之後補」這類字眼。

**Type consistency:** `historyGateway.js` 四個函式的參數順序 `(session, storage, supabase, ...)` 在 Task 5 的實作、Task 7(`historyController.js`)、Task 8(`toolController.js`)的呼叫方式一致;`cloudHistoryStore.js` 回傳的紀錄物件欄位(`id`/`timestamp`/`diameter`/...)跟 `historyStore.js` 既有紀錄物件形狀一致,`historyView.js` 的 `renderHistoryList`/`renderHistoryRecord` 不需要跟著改。
