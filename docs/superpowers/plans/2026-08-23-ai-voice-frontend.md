# AI 語音輸入前端(登入 + 麥克風按鈕) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a microphone button and Google-login status to `tool.html` so a logged-in user can speak a diameter+alloy, have it parsed by the backend Edge Function (built in the companion backend plan), and see the diameter/alloy fields auto-fill and the existing compare table recompute — with the last 20 voice inputs kept in `localStorage`.

**Architecture:** Follows this project's existing three-layer split (`core` / `data` / `ui`). Two new `data/` files: `supabaseClient.js` (auth session + Google sign-in, wraps `@supabase/supabase-js`) and `voiceParseClient.js` (calls the `parse-drill-voice` Edge Function, `fetch` is dependency-injected so it's unit-testable, mirroring how `historyStore.js` injects `storage`). A third `data/` file, `voiceHistoryStore.js`, mirrors `historyStore.js` exactly for the voice-input localStorage log. One new `ui/` pair: `voiceInputView.js` (pure render functions — button labels, error text, login status — unit tested) and `voiceInputController.js` (DOM wiring: Web Speech API, click handlers, calls into the `data` layer; not unit tested, verified manually in a browser, exactly like the existing `toolController.js`). `tool.html` gets a small new bar (login status + mic button) above the existing field grid; no existing markup, script, or logic is touched.

**Tech Stack:** Plain ES modules, no bundler/build step (matches the rest of the site). `@supabase/supabase-js@2` loaded via the `esm.sh` CDN (`https://esm.sh/@supabase/supabase-js@2`) — same "no build step" approach as this project already uses for Google Fonts. Browser's built-in Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) for speech-to-text — free, no dependency. Node's built-in test runner for the pure/testable files.

**Spec:** [docs/superpowers/specs/2026-08-22-ai-voice-input-login-design.md](../specs/2026-08-22-ai-voice-input-login-design.md) — this plan implements the "瀏覽器" box in that spec's architecture diagram and the full 使用者流程 section.

**Depends on:** [docs/superpowers/plans/2026-08-23-ai-voice-backend.md](2026-08-23-ai-voice-backend.md) must be deployed first — this plan calls the live `parse-drill-voice` Edge Function URL and needs a real Supabase anon key (Task 1 below).

## Global Constraints

- 只有 AI 語音輸入這個功能需要登入;`tool.html` 原本的計算器邏輯、`history.html`、`index.html` 完全不變、不需要登入。
- Google 登入透過 Supabase Auth(`supabase.auth.signInWithOAuth({ provider: 'google' })`),不做信箱/密碼登入。
- 語音輸入紀錄(最近 20 筆)存 `localStorage`,獨立的 key(`drillVoiceInputHistory_v1`),不跟現有的計算歷史紀錄(`drillSelectionHistory_v1`)混在一起。超過 20 筆自動汰舊(只留最新 20 筆)。
- 解析失敗時**整欄不填**、顯示錯誤訊息、不做部分猜測填入——欄位只有在後端回傳 `{ ok: true, diameter, alloy }` 時才寫入。
- 瀏覽器不支援語音辨識時,麥克風按鈕顯示為不可用狀態並附文字說明,不能讓使用者點了沒反應。
- Supabase 的 URL 和 anon key 是公開安全的值(前端本來就要帶著呼叫 Supabase),可以直接寫在程式碼裡,**不是**需要保密的金鑰;但 Anthropic API 金鑰绝對不能出現在任何前端檔案。
- 沿用現有分層:`data/*.js` 不碰 DOM;`ui/*View.js` 是純函式(輸入資料、輸出字串或物件,不碰 `document`);`ui/*Controller.js` 是唯一碰 `document`/瀏覽器 API 的地方。
- 填入直徑/材質欄位後,要讓現有的 `toolController.js` 重新計算比較表——做法是對欄位 dispatch 原生 `input`/`change` 事件,不要重複實作一份計算邏輯或直接呼叫 `toolController.js` 內部函式(它們沒有 export)。

---

### Task 1: `data/supabaseClient.js` — Supabase 用戶端與 Google 登入

**Files:**
- Create: `assets/data/supabaseClient.js`

**Interfaces:**
- Produces: `supabase`(已設定好的 Supabase client 實例)、`getSession(): Promise<Session|null>`、`signInWithGoogle(): Promise<void>`、`signOut(): Promise<void>`、`onAuthStateChange(callback: (session: Session|null) => void): Subscription`
- 這個檔案碰網路與第三方 SDK,不寫自動化測試(跟 `toolController.js` 一樣手動驗證),所以沒有 TDD 步驟,直接實作 + 手動確認。

- [ ] **Step 1: 取得 Supabase anon key**

Supabase 專案 URL 已知是 `https://eefnzpqveljowridmhto.supabase.co`,但 anon key(前端要用的公開金鑰,不是 service role key)還沒有記錄下來。這是公開安全的值,不需要保密,但需要**請使用者去 Supabase 後台複製給你**:

1. 打開 https://supabase.com/dashboard (或既有分頁),進入 `YUAN-117's Project`
2. 用 Ctrl+K 搜尋 `API Keys`,或左側選單找 Project Settings → API Keys
3. 複製 `anon` `public` 那把 key(一長串 `eyJ...` 開頭的字串)

拿到之後貼給你,填進下面 Step 2 的 `SUPABASE_ANON_KEY`。

- [ ] **Step 2: 寫 `assets/data/supabaseClient.js`**

```js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://eefnzpqveljowridmhto.supabase.co';
const SUPABASE_ANON_KEY = '<貼上 Step 1 拿到的 anon public key>';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href }
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return data.subscription;
}
```

- [ ] **Step 3: 手動驗證**

在瀏覽器 DevTools Console 貼上以下程式碼手動測試(暫時測試用,不寫進檔案):

```js
import('./assets/data/supabaseClient.js').then(async (m) => {
  console.log('session before login:', await m.getSession());
});
```

Expected: 印出 `null`(還沒登入)。如果印出錯誤(例如 `Failed to fetch` 或 key 格式錯誤),回頭檢查 Step 1 貼的 anon key 是否正確、有沒有多餘空白。

**額外的必要設定(2026-08-24 手動測試時發現,不在原本的規格裡)**:Supabase 後台 Authentication → URL Configuration 的 **Redirect URLs** 預設是空的,Site URL 是 Supabase 給的預設值 `http://localhost:3000`。Google 登入完成後 Supabase 只會導回這個清單裡列出的網址,不在清單裡就會被導去錯的地方、畫面卡在「未登入」。**需要在這裡把測試/正式環境的網址加進 Redirect URLs**(例如本機測試用 `http://127.0.0.1:5500/**`,之後部署到 GitHub Pages 要另外加 `https://yuan-117.github.io/**`),同時 `signInWithGoogle()` 要明確帶 `options: { redirectTo: window.location.href }`(已經寫進上面 Step 2 的程式碼裡)才會登入完準確導回原本的頁面而不是首頁。

- [ ] **Step 4: Commit**

```bash
git add assets/data/supabaseClient.js
git commit -m "feat: add Supabase client with Google sign-in helpers"
```

---

### Task 2: `data/voiceHistoryStore.js` — 語音輸入紀錄(最近 20 筆)

**Files:**
- Create: `assets/data/voiceHistoryStore.js`
- Test: `assets/data/voiceHistoryStore.test.js`

**Interfaces:**
- Produces: `VOICE_HISTORY_STORAGE_KEY` (string), `VOICE_HISTORY_MAX_RECORDS` (number, 20), `loadVoiceHistory(storage): Array`, `addVoiceHistoryRecord(storage, transcript: string, diameter: number, alloy: string): Array` (returns the updated, trimmed list, newest first)

- [ ] **Step 1: Write the failing tests**

Create `assets/data/voiceHistoryStore.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VOICE_HISTORY_STORAGE_KEY,
  VOICE_HISTORY_MAX_RECORDS,
  loadVoiceHistory,
  addVoiceHistoryRecord
} from './voiceHistoryStore.js';

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, value)
  };
}

test('loadVoiceHistory returns an empty array when nothing is stored', () => {
  assert.deepEqual(loadVoiceHistory(createMemoryStorage()), []);
});

test('loadVoiceHistory returns an empty array when the stored value is not valid JSON', () => {
  const storage = createMemoryStorage();
  storage.setItem(VOICE_HISTORY_STORAGE_KEY, 'not json');
  assert.deepEqual(loadVoiceHistory(storage), []);
});

test('addVoiceHistoryRecord stores transcript, diameter, alloy, id, timestamp', () => {
  const storage = createMemoryStorage();
  const list = addVoiceHistoryRecord(storage, '8mm 6061', 8, '6061');
  assert.equal(list.length, 1);
  assert.equal(list[0].transcript, '8mm 6061');
  assert.equal(list[0].diameter, 8);
  assert.equal(list[0].alloy, '6061');
  assert.ok(list[0].id);
  assert.ok(list[0].timestamp);
});

test('addVoiceHistoryRecord puts the newest record first', () => {
  const storage = createMemoryStorage();
  addVoiceHistoryRecord(storage, '8mm 6061', 8, '6061');
  addVoiceHistoryRecord(storage, '10mm 7075', 10, '7075');
  const list = loadVoiceHistory(storage);
  assert.equal(list[0].diameter, 10);
  assert.equal(list[1].diameter, 8);
});

test('addVoiceHistoryRecord keeps only the most recent 20 records', () => {
  const storage = createMemoryStorage();
  for (let i = 0; i < VOICE_HISTORY_MAX_RECORDS + 5; i++) {
    addVoiceHistoryRecord(storage, `record ${i}`, 8, '6061');
  }
  const list = loadVoiceHistory(storage);
  assert.equal(list.length, VOICE_HISTORY_MAX_RECORDS);
  assert.equal(list[0].transcript, `record ${VOICE_HISTORY_MAX_RECORDS + 4}`);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `assets/data/voiceHistoryStore.js` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `assets/data/voiceHistoryStore.js`:

```js
export const VOICE_HISTORY_STORAGE_KEY = 'drillVoiceInputHistory_v1';
export const VOICE_HISTORY_MAX_RECORDS = 20;

export function loadVoiceHistory(storage) {
  try {
    const raw = storage.getItem(VOICE_HISTORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveVoiceHistory(storage, list) {
  try {
    storage.setItem(VOICE_HISTORY_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore quota errors / unavailable storage (e.g. Safari private browsing).
  }
}

function makeRecordId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export function addVoiceHistoryRecord(storage, transcript, diameter, alloy) {
  const list = loadVoiceHistory(storage);
  list.unshift({
    id: makeRecordId(),
    timestamp: new Date().toISOString(),
    transcript,
    diameter,
    alloy
  });
  const trimmed = list.slice(0, VOICE_HISTORY_MAX_RECORDS);
  saveVoiceHistory(storage, trimmed);
  return trimmed;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add assets/data/voiceHistoryStore.js assets/data/voiceHistoryStore.test.js
git commit -m "feat: add localStorage log for voice input records"
```

---

### Task 3: `data/voiceParseClient.js` — 呼叫 Edge Function

**Files:**
- Create: `assets/data/voiceParseClient.js`
- Test: `assets/data/voiceParseClient.test.js`

**Interfaces:**
- Produces: `EDGE_FUNCTION_URL` (string), `parseVoiceInput({ fetchImpl, transcript, accessToken }): Promise<{ok: true, diameter: number, alloy: string} | {ok: false, code: string, limit?: number}>` — `code` is one of the values the backend plan's `index.ts` returns (`NOT_AUTHENTICATED`, `EMPTY`, `TOO_LONG`, `RATE_LIMITED`, `AI_UNAVAILABLE`, `PARSE_FAILED`) plus `NETWORK_ERROR` for local fetch/parse failures.
- `fetchImpl` is dependency-injected (same pattern as `storage` in `historyStore.js`) so this is unit-testable without a real network call.

- [ ] **Step 1: Write the failing tests**

Create `assets/data/voiceParseClient.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVoiceInput, EDGE_FUNCTION_URL } from './voiceParseClient.js';

function fakeFetch(responseBody, { ok = true } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok, json: async () => responseBody };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

test('returns the parsed result on success', async () => {
  const fetchImpl = fakeFetch({ ok: true, diameter: 8, alloy: '6061' });
  const result = await parseVoiceInput({ fetchImpl, transcript: '8mm 6061', accessToken: 'tok' });
  assert.deepEqual(result, { ok: true, diameter: 8, alloy: '6061' });
});

test('passes the transcript, auth header, and correct URL', async () => {
  const fetchImpl = fakeFetch({ ok: true, diameter: 8, alloy: '6061' });
  await parseVoiceInput({ fetchImpl, transcript: '8mm 6061', accessToken: 'my-token' });
  const [{ url, options }] = fetchImpl.calls;
  assert.equal(url, EDGE_FUNCTION_URL);
  assert.equal(options.method, 'POST');
  assert.equal(options.headers.Authorization, 'Bearer my-token');
  assert.deepEqual(JSON.parse(options.body), { transcript: '8mm 6061' });
});

test('passes through an error code from the backend (e.g. rate limited)', async () => {
  const fetchImpl = fakeFetch({ ok: false, code: 'RATE_LIMITED', limit: 15 }, { ok: false });
  const result = await parseVoiceInput({ fetchImpl, transcript: '8mm 6061', accessToken: 'tok' });
  assert.deepEqual(result, { ok: false, code: 'RATE_LIMITED', limit: 15 });
});

test('returns NETWORK_ERROR when fetch throws', async () => {
  const fetchImpl = async () => { throw new Error('offline'); };
  const result = await parseVoiceInput({ fetchImpl, transcript: '8mm 6061', accessToken: 'tok' });
  assert.deepEqual(result, { ok: false, code: 'NETWORK_ERROR' });
});

test('returns NETWORK_ERROR when the response body is not valid JSON', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => { throw new Error('bad json'); } });
  const result = await parseVoiceInput({ fetchImpl, transcript: '8mm 6061', accessToken: 'tok' });
  assert.deepEqual(result, { ok: false, code: 'NETWORK_ERROR' });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `assets/data/voiceParseClient.js` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `assets/data/voiceParseClient.js`:

```js
export const EDGE_FUNCTION_URL = 'https://eefnzpqveljowridmhto.supabase.co/functions/v1/parse-drill-voice';

export async function parseVoiceInput({ fetchImpl, transcript, accessToken }) {
  let response;
  try {
    response = await fetchImpl(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ transcript })
    });
  } catch {
    return { ok: false, code: 'NETWORK_ERROR' };
  }

  try {
    return await response.json();
  } catch {
    return { ok: false, code: 'NETWORK_ERROR' };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add assets/data/voiceParseClient.js assets/data/voiceParseClient.test.js
git commit -m "feat: add client for calling the parse-drill-voice edge function"
```

---

### Task 4: `ui/voiceInputView.js` — 純渲染函式(按鈕文字、錯誤訊息、登入狀態)

**Files:**
- Create: `assets/ui/voiceInputView.js`
- Test: `assets/ui/voiceInputView.test.js`

**Interfaces:**
- Produces: `renderMicButtonLabel(state: 'idle'|'listening'|'processing'): string`, `renderErrorMessage(code: string): string`, `renderLoginStatus(session: object|null): { label: string, showLoginButton: boolean }`
- Consumes: the same `code` strings Task 3's `parseVoiceInput` can return, plus `'NOT_SUPPORTED'` for the browser-doesn't-support-speech-recognition case (Task 6 uses this one directly, not via the backend).

- [ ] **Step 1: Write the failing tests**

Create `assets/ui/voiceInputView.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMicButtonLabel, renderErrorMessage, renderLoginStatus } from './voiceInputView.js';

test('renderMicButtonLabel has a distinct label per state', () => {
  const idle = renderMicButtonLabel('idle');
  const listening = renderMicButtonLabel('listening');
  const processing = renderMicButtonLabel('processing');
  assert.notEqual(idle, listening);
  assert.notEqual(idle, processing);
  assert.notEqual(listening, processing);
});

test('renderMicButtonLabel falls back to the idle label for an unknown state', () => {
  assert.equal(renderMicButtonLabel('bogus'), renderMicButtonLabel('idle'));
});

test('renderErrorMessage returns a distinct message for each known backend error code', () => {
  const codes = ['NOT_AUTHENTICATED', 'EMPTY', 'TOO_LONG', 'RATE_LIMITED', 'PARSE_FAILED', 'AI_UNAVAILABLE', 'NETWORK_ERROR', 'NOT_SUPPORTED'];
  const messages = codes.map(renderErrorMessage);
  assert.equal(new Set(messages).size, codes.length);
});

test('renderErrorMessage falls back to a generic message for an unknown code', () => {
  assert.equal(typeof renderErrorMessage('SOME_UNKNOWN_CODE'), 'string');
});

test('renderLoginStatus reports signed-out state with a login button', () => {
  assert.deepEqual(renderLoginStatus(null), { label: '未登入', showLoginButton: true });
});

test('renderLoginStatus reports the signed-in email without a login button', () => {
  const session = { user: { email: 'a@example.com' } };
  const result = renderLoginStatus(session);
  assert.equal(result.showLoginButton, false);
  assert.ok(result.label.includes('a@example.com'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `assets/ui/voiceInputView.js` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `assets/ui/voiceInputView.js`:

```js
const MIC_LABELS = {
  idle: '🎤 語音輸入',
  listening: '🎙️ 聆聽中...點擊停止',
  processing: '⏳ 辨識中...'
};

export function renderMicButtonLabel(state) {
  return MIC_LABELS[state] ?? MIC_LABELS.idle;
}

const ERROR_MESSAGES = {
  NOT_AUTHENTICATED: '請先使用 Google 登入',
  EMPTY: '沒有聽到內容,請再說一次',
  TOO_LONG: '輸入過長,請簡短描述',
  RATE_LIMITED: '已達每小時使用上限,請稍後再試',
  PARSE_FAILED: '聽不懂,請重新說一次,記得說出直徑與材質',
  AI_UNAVAILABLE: 'AI 服務暫時無法使用,請稍後再試',
  NETWORK_ERROR: '網路連線異常,請稍後再試',
  NOT_SUPPORTED: '此瀏覽器不支援語音輸入'
};

export function renderErrorMessage(code) {
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.NETWORK_ERROR;
}

export function renderLoginStatus(session) {
  if (!session) {
    return { label: '未登入', showLoginButton: true };
  }
  const email = session.user?.email ?? '';
  return { label: `已登入:${email}`, showLoginButton: false };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add assets/ui/voiceInputView.js assets/ui/voiceInputView.test.js
git commit -m "feat: add pure render functions for voice input UI states"
```

---

### Task 5: `tool.html` + `assets/style.css` — 麥克風按鈕與登入狀態列

**Files:**
- Modify: `tool.html`
- Modify: `assets/style.css`

**Interfaces:**
- Produces: DOM elements `#loginStatus`, `#loginBtn`, `#micBtn`, `#voiceStatus` that Task 6's controller wires up.

- [ ] **Step 1: 在 `tool.html` 加入語音輸入列**

In `tool.html`, insert this new block right after the opening `<section class="panel" aria-label="輸入與比較結果">` tag (i.e. immediately before the existing `<div class="field-grid">`):

```html
    <div class="voice-input-bar">
      <div class="login-status">
        <span id="loginStatus">檢查登入狀態...</span>
        <button class="btn-ghost" id="loginBtn" type="button">使用 Google 登入</button>
      </div>
      <button class="btn-primary" id="micBtn" type="button">🎤 語音輸入</button>
    </div>
    <div class="hint" id="voiceStatus">&nbsp;</div>

```

- [ ] **Step 2: 加入 controller 的 script 標籤**

In `tool.html`, right after the existing `<script type="module" src="assets/ui/toolController.js"></script>` line, add:

```html
<script type="module" src="assets/ui/voiceInputController.js"></script>
```

(This script doesn't exist yet — it's created in Task 6. The tag is added now so Task 6 only has to create the file.)

- [ ] **Step 3: 加入 CSS**

In `assets/style.css`, append:

```css
.voice-input-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.login-status {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--text-muted);
}

#voiceStatus.voice-status-error {
  color: var(--danger);
}
```

- [ ] **Step 4: 手動確認畫面(此時麥克風按鈕還不會動作,Task 6 才會接上邏輯)**

在瀏覽器打開 `tool.html`,確認:
- 畫面上方出現「檢查登入狀態...」文字、「使用 Google 登入」按鈕、「🎤 語音輸入」按鈕
- 版面沒有跑版,深色模式(系統深色主題)下文字看得清楚
- 瀏覽器 Console 沒有因為找不到 `voiceInputController.js` 而報錯中斷其他 script(module 找不到檔案只會讓那個 module 自己失敗,不會影響 `toolController.js`,但確認一下比較保險)

- [ ] **Step 5: Commit**

```bash
git add tool.html assets/style.css
git commit -m "feat: add voice input bar markup and styles to tool.html"
```

---

### Task 6: `ui/voiceInputController.js` — 串接語音辨識、登入、後端呼叫

**Files:**
- Create: `assets/ui/voiceInputController.js`

**Interfaces:**
- Consumes: `supabase`, `getSession`, `signInWithGoogle`, `onAuthStateChange` (Task 1); `addVoiceHistoryRecord` (Task 2); `parseVoiceInput` (Task 3); `renderMicButtonLabel`, `renderErrorMessage`, `renderLoginStatus` (Task 4); DOM elements `#loginStatus`, `#loginBtn`, `#micBtn`, `#voiceStatus` (Task 5) plus the existing `#diameter`, `#alloy` from `tool.html`.
- This file touches `document`, `window.SpeechRecognition`, and the network — not unit tested, verified manually (Task 7), same as `toolController.js`.

- [ ] **Step 1: Write the implementation**

Create `assets/ui/voiceInputController.js`:

```js
import { getSession, signInWithGoogle, onAuthStateChange } from '../data/supabaseClient.js';
import { parseVoiceInput } from '../data/voiceParseClient.js';
import { addVoiceHistoryRecord } from '../data/voiceHistoryStore.js';
import { renderMicButtonLabel, renderErrorMessage, renderLoginStatus } from './voiceInputView.js';

const micBtn = document.getElementById('micBtn');
const loginBtn = document.getElementById('loginBtn');
const loginStatus = document.getElementById('loginStatus');
const voiceStatus = document.getElementById('voiceStatus');
const diameterEl = document.getElementById('diameter');
const alloyEl = document.getElementById('alloy');

const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

function setVoiceStatus(text, isError) {
  voiceStatus.textContent = text;
  voiceStatus.classList.toggle('voice-status-error', Boolean(isError));
}

function fillFormAndRecompute(diameter, alloy) {
  diameterEl.value = diameter;
  alloyEl.value = alloy;
  diameterEl.dispatchEvent(new Event('input', { bubbles: true }));
  alloyEl.dispatchEvent(new Event('change', { bubbles: true }));
}

async function handleTranscript(transcript, accessToken) {
  setVoiceStatus('辨識中...', false);
  const result = await parseVoiceInput({ fetchImpl: fetch, transcript, accessToken });
  if (!result.ok) {
    setVoiceStatus(renderErrorMessage(result.code), true);
    return;
  }
  fillFormAndRecompute(result.diameter, result.alloy);
  addVoiceHistoryRecord(localStorage, transcript, result.diameter, result.alloy);
  setVoiceStatus('已自動填入 ✓', false);
}

async function startListening() {
  const session = await getSession();
  if (!session) {
    setVoiceStatus(renderErrorMessage('NOT_AUTHENTICATED'), true);
    return;
  }

  const recognition = new SpeechRecognitionCtor();
  recognition.lang = 'zh-TW';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  micBtn.textContent = renderMicButtonLabel('listening');
  setVoiceStatus('聆聽中...請說出直徑與材質,例如「8mm 6061」', false);

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    micBtn.textContent = renderMicButtonLabel('processing');
    handleTranscript(transcript, session.access_token).finally(() => {
      micBtn.textContent = renderMicButtonLabel('idle');
    });
  };

  recognition.onerror = () => {
    micBtn.textContent = renderMicButtonLabel('idle');
    setVoiceStatus(renderErrorMessage('NETWORK_ERROR'), true);
  };

  recognition.onend = () => {
    micBtn.textContent = renderMicButtonLabel('idle');
  };

  recognition.start();
}

function updateLoginUi(session) {
  const { label, showLoginButton } = renderLoginStatus(session);
  loginStatus.textContent = label;
  loginBtn.style.display = showLoginButton ? '' : 'none';
}

if (!SpeechRecognitionCtor) {
  micBtn.disabled = true;
  setVoiceStatus(renderErrorMessage('NOT_SUPPORTED'), true);
} else {
  micBtn.addEventListener('click', startListening);
}

loginBtn.addEventListener('click', () => {
  signInWithGoogle();
});

onAuthStateChange(updateLoginUi);
getSession().then(updateLoginUi);
```

- [ ] **Step 2: Commit**

```bash
git add assets/ui/voiceInputController.js
git commit -m "feat: wire up voice input controller (speech recognition, login, parsing)"
```

---

### Task 7: 手動端對端驗證

**Files:** none — this is a manual browser verification checklist, matching the spec's testing strategy ("與 Google 登入、真的呼叫 AI API 的整合流程,採手動瀏覽器驗證").

- [ ] **Step 1: 未登入狀態**

打開 `tool.html`(用 `npx serve` 或任何本機靜態伺服器,不能用 `file://`,否則 ES module 的 CORS 規則會擋掉)。確認畫面顯示「未登入」與「使用 Google 登入」按鈕。點麥克風按鈕,確認顯示「請先使用 Google 登入」,**沒有**跳出瀏覽器麥克風權限請求(代表沒有呼叫語音辨識)。

- [ ] **Step 2: 登入**

點「使用 Google 登入」,完成 Google 帳號選擇流程後應該導回 `tool.html`。確認畫面的登入狀態變成「已登入:你的 email」,登入按鈕消失。

- [ ] **Step 3: 成功辨識**

點麥克風按鈕,允許瀏覽器的麥克風權限請求,清楚說出「8mm 6061」。確認:
- 直徑欄位變成 `8`,材質欄位變成 `6061`
- 下方比較表出現三種鑽頭材質的計算結果(代表 `input`/`change` 事件有正確觸發 `toolController.js` 的重新計算)
- 狀態文字顯示「已自動填入 ✓」

- [ ] **Step 4: 檢查 localStorage**

開 DevTools → Application → Local Storage,確認 `drillVoiceInputHistory_v1` 這個 key 有一筆新紀錄,內容包含剛才的逐字稿、`diameter: 8`、`alloy: '6061'`。

- [ ] **Step 5: 解析失敗**

點麥克風,說一句無關的話(例如「今天天氣真好」)。確認顯示「聽不懂,請重新說一次,記得說出直徑與材質」,直徑/材質欄位**維持原值不變**(不是被清空或亂填)。

- [ ] **Step 6: 超過次數上限**

在 DevTools Console 手動重複呼叫後端 15 次以上(或耐心用麥克風測 16 次),確認第 16 次(當小時內)顯示「已達每小時使用上限,請稍後再試」。這步也同時驗證了後端 plan 的 `ai_usage` 次數限制邏輯在真實環境下有生效。

- [ ] **Step 7: 不支援語音辨識的瀏覽器**

用 Firefox(目前對 `SpeechRecognition` 支援不完整)打開 `tool.html`,確認麥克風按鈕顯示為不可用狀態,並顯示「此瀏覽器不支援語音輸入」提示,而不是點了沒反應或報錯。

- [ ] **Step 8: 確認現有功能沒有被影響**

不登入的狀態下,正常使用直徑/材質欄位手動輸入計算、加入歷史紀錄、切到 `history.html` 查看紀錄——確認這些既有功能完全正常,跟這個子專案開始前一樣。
