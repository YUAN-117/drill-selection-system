# AI 語音輸入後端(Supabase Edge Function) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Supabase Edge Function `parse-drill-voice` that takes a logged-in user's spoken-text transcript, enforces anti-abuse limits, calls Anthropic Claude Haiku to extract `{ diameter, alloy }`, and returns a structured result — without ever exposing the Anthropic API key to the browser.

**Architecture:** The function is split into small pure logic files (input length check, hourly rate-limit check, Anthropic request builder, Anthropic response validator) that have no dependency on Deno, Supabase, or the network — these are unit-tested with the project's existing `node --test` runner, exactly like `assets/core/*.js`. A single `index.ts` entrypoint (Deno runtime, deployed to Supabase) wires those pure functions together with the two side-effecting calls (querying/writing the `ai_usage` table via `@supabase/supabase-js`, calling Anthropic via `@anthropic-ai/sdk`) and is verified manually, the same way this project already treats `*Controller.js` as DOM-touching and manually verified.

**Tech Stack:** Deno (Supabase Edge Functions runtime), `npm:@supabase/supabase-js@2` and `npm:@anthropic-ai/sdk` via Deno npm specifiers (no build step, no bundler), Postgres (Supabase), `@anthropic-ai/sdk` model `claude-haiku-4-5` with forced tool-use for structured output. Pure logic files are plain ESM `.js`, tested with Node's built-in test runner (`npm test` at repo root already runs `node --test`, which auto-discovers `**/*.test.js` anywhere in the repo, including under `supabase/`).

**Spec:** [docs/superpowers/specs/2026-08-22-ai-voice-input-login-design.md](../specs/2026-08-22-ai-voice-input-login-design.md) — this plan implements the "Edge Function" box in that spec's architecture diagram (steps 1–6) and the `ai_usage` table.

## Global Constraints

- Google 登入使用者才能呼叫這個函式;未登入請求一律 401(前端不應該讓未登入使用者觸發呼叫,但後端仍要自己驗證,不能只信任前端)。
- 每帳號每小時最多 15 次請求(`HOURLY_REQUEST_LIMIT`),超過回傳 429。次數以「呼叫這支函式的次數」計,不是「解析成功的次數」——連 AI 解析失敗的請求也算一次額度,因為都已經花了 AI 呼叫的成本。
- 單次輸入文字上限 100 字(`MAX_TRANSCRIPT_LENGTH`),超過直接拒絕、不呼叫 AI(省成本)。
- Anthropic API 金鑰(`ANTHROPIC_API_KEY`)只存在於 Supabase Edge Function 的環境變數,絕對不能出現在任何前端程式碼、任何回傳給瀏覽器的內容,或 git 裡的任何檔案。
- AI 一律用 Anthropic Claude Haiku(`claude-haiku-4-5`),用強制 tool-call 的方式取得結構化輸出,不用「請 AI 輸出 JSON 文字後自己 parse」的作法。
- 鋁合金材質只接受 `6061`、`7075`、`a380` 三種鍵值(跟 `assets/core/materials.js` 的 `ALLOY_LABELS` 一致,但**不含** `custom`——AI 沒辦法幫使用者猜「自訂材質」該填什麼參數)。
- 直徑只接受 1–32(mm)範圍內的數字,對應 `assets/core/diameter.js` 的市售鑽頭尺寸範圍下限與上限。
- 解析失敗(欄位缺漏、超出範圍、AI 沒呼叫工具)一律回傳「無法辨識」,絕不猜測填值——這是延續這個專案從一開始就有的「不憑空捏造精確數字、資訊不足不要瞎猜」原則(見 `HANDOFF.md`)。
- 不存語音內容本身,`ai_usage` 表只記錄「誰、什麼時候呼叫」,不記錄逐字稿或解析結果。
- 這個函式的純邏輯部分(輸入驗證、次數限制判斷、request 組裝、response 驗證)要能用 Node 測試,不依賴 Deno 專屬 API、不依賴真的網路呼叫。`index.ts` 本身(串接 Deno/Supabase/Anthropic 的部分)採手動驗證,不寫自動化測試,比照專案裡 `*Controller.js` 的做法。

---

### Task 1: 專案骨架 — 目錄結構與資料庫 migration

**Files:**
- Create: `supabase/functions/parse-drill-voice/`(空目錄,後續任務填入檔案)
- Create: `supabase/migrations/20260823000000_create_ai_usage.sql`

**Interfaces:**
- Produces: `public.ai_usage` 資料表結構(`user_id uuid`, `created_at timestamptz`),供 Task 6 的 `index.ts` 查詢/寫入使用。這個 migration 檔案這個任務只是「寫好」,實際套用到 Supabase 專案是 Task 7(部署)才做,因為套用需要 Supabase CLI,現在使用者電腦還沒裝。

- [ ] **Step 1: 建立目錄**

```bash
mkdir -p supabase/functions/parse-drill-voice supabase/migrations
```

- [ ] **Step 2: 寫 migration SQL**

Create `supabase/migrations/20260823000000_create_ai_usage.sql`:

```sql
-- Records one row per successful call to the parse-drill-voice Edge Function.
-- Used only to count how many requests a user made in the last hour (anti-abuse).
-- Does NOT store the transcript or the parsed result.
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_user_id_created_at_idx
  on public.ai_usage (user_id, created_at);

-- RLS is enabled with no policies: only the Edge Function's service-role
-- client (which bypasses RLS) can read/write this table. No anon/authenticated
-- client can query it directly.
alter table public.ai_usage enable row level security;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/parse-drill-voice supabase/migrations
git commit -m "chore: scaffold parse-drill-voice edge function and ai_usage migration"
```

Note: `mkdir` won't stage an empty directory in git — if the directory is empty after Step 1, this commit will only add the migration file. That's fine; Task 2 adds the first real file to `supabase/functions/parse-drill-voice/` and that commit will create the directory in git.

---

### Task 2: `validateInput.js` — 輸入長度檢查

**Files:**
- Create: `supabase/functions/parse-drill-voice/validateInput.js`
- Test: `supabase/functions/parse-drill-voice/validateInput.test.js`

**Interfaces:**
- Produces: `MAX_TRANSCRIPT_LENGTH` (number, 100), `validateTranscript(text: unknown): { valid: boolean, reason: 'EMPTY' | 'TOO_LONG' | null }`

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/parse-drill-voice/validateInput.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTranscript, MAX_TRANSCRIPT_LENGTH } from './validateInput.js';

test('accepts a normal short transcript', () => {
  assert.deepEqual(validateTranscript('8mm 6061'), { valid: true, reason: null });
});

test('rejects an empty string', () => {
  assert.equal(validateTranscript('').valid, false);
  assert.equal(validateTranscript('').reason, 'EMPTY');
});

test('rejects a whitespace-only string', () => {
  assert.equal(validateTranscript('   ').reason, 'EMPTY');
});

test('rejects a non-string value', () => {
  assert.equal(validateTranscript(undefined).reason, 'EMPTY');
});

test('accepts a transcript exactly at the length limit', () => {
  const text = 'a'.repeat(MAX_TRANSCRIPT_LENGTH);
  assert.equal(validateTranscript(text).valid, true);
});

test('rejects a transcript over the length limit', () => {
  const text = 'a'.repeat(MAX_TRANSCRIPT_LENGTH + 1);
  assert.equal(validateTranscript(text).reason, 'TOO_LONG');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `supabase/functions/parse-drill-voice/validateInput.js` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/parse-drill-voice/validateInput.js`:

```js
export const MAX_TRANSCRIPT_LENGTH = 100;

export function validateTranscript(text) {
  if (typeof text !== 'string') return { valid: false, reason: 'EMPTY' };
  const trimmed = text.trim();
  if (trimmed.length === 0) return { valid: false, reason: 'EMPTY' };
  if (trimmed.length > MAX_TRANSCRIPT_LENGTH) return { valid: false, reason: 'TOO_LONG' };
  return { valid: true, reason: null };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all `validateInput.test.js` tests green, plus every existing test still green).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/parse-drill-voice/validateInput.js supabase/functions/parse-drill-voice/validateInput.test.js
git commit -m "feat: add transcript length validation for voice input parsing"
```

---

### Task 3: `rateLimit.js` — 每小時次數上限判斷

**Files:**
- Create: `supabase/functions/parse-drill-voice/rateLimit.js`
- Test: `supabase/functions/parse-drill-voice/rateLimit.test.js`

**Interfaces:**
- Produces: `HOURLY_REQUEST_LIMIT` (number, 15), `isRateLimited(recentRequestCount: number, limit?: number): boolean`
- Consumes: nothing (pure function; the actual "how many requests in the last hour" count is computed in Task 6's `index.ts` via a Supabase query, then passed in here).

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/parse-drill-voice/rateLimit.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRateLimited, HOURLY_REQUEST_LIMIT } from './rateLimit.js';

test('allows requests below the limit', () => {
  assert.equal(isRateLimited(0), false);
  assert.equal(isRateLimited(HOURLY_REQUEST_LIMIT - 1), false);
});

test('blocks requests at or above the limit', () => {
  assert.equal(isRateLimited(HOURLY_REQUEST_LIMIT), true);
  assert.equal(isRateLimited(HOURLY_REQUEST_LIMIT + 5), true);
});

test('respects a custom limit override', () => {
  assert.equal(isRateLimited(3, 3), true);
  assert.equal(isRateLimited(2, 3), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `rateLimit.js` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/parse-drill-voice/rateLimit.js`:

```js
export const HOURLY_REQUEST_LIMIT = 15;

export function isRateLimited(recentRequestCount, limit = HOURLY_REQUEST_LIMIT) {
  return recentRequestCount >= limit;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/parse-drill-voice/rateLimit.js supabase/functions/parse-drill-voice/rateLimit.test.js
git commit -m "feat: add hourly rate limit check for voice input parsing"
```

---

### Task 4: `promptBuilder.js` — 組出強制 tool-call 的 Anthropic 請求

**Files:**
- Create: `supabase/functions/parse-drill-voice/promptBuilder.js`
- Test: `supabase/functions/parse-drill-voice/promptBuilder.test.js`

**Interfaces:**
- Produces: `VOICE_INPUT_TOOL_NAME` (string, `'record_drill_voice_input'`), `buildParseRequest(transcript: string): object` — the object shape matches `@anthropic-ai/sdk`'s `client.messages.create(...)` params (`model`, `max_tokens`, `system`, `tools`, `tool_choice`, `messages`), so Task 6 can pass it straight through: `anthropic.messages.create(buildParseRequest(transcript))`.
- Consumes: nothing.

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/parse-drill-voice/promptBuilder.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildParseRequest, VOICE_INPUT_TOOL_NAME } from './promptBuilder.js';

test('sends the transcript as the user message', () => {
  const req = buildParseRequest('8mm 6061 鋁合金');
  assert.equal(req.messages.length, 1);
  assert.equal(req.messages[0].role, 'user');
  assert.equal(req.messages[0].content, '8mm 6061 鋁合金');
});

test('forces the tool call so the response is always structured', () => {
  const req = buildParseRequest('8mm 6061');
  assert.deepEqual(req.tool_choice, { type: 'tool', name: VOICE_INPUT_TOOL_NAME });
  assert.equal(req.tools.length, 1);
  assert.equal(req.tools[0].name, VOICE_INPUT_TOOL_NAME);
});

test('restricts the alloy field to the three known keys', () => {
  const req = buildParseRequest('8mm 6061');
  assert.deepEqual(req.tools[0].input_schema.properties.alloy.enum, ['6061', '7075', 'a380']);
});

test('uses the Haiku model with a small max_tokens cap', () => {
  const req = buildParseRequest('8mm 6061');
  assert.equal(req.model, 'claude-haiku-4-5');
  assert.ok(req.max_tokens <= 1000);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `promptBuilder.js` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/parse-drill-voice/promptBuilder.js`:

```js
export const VOICE_INPUT_TOOL_NAME = 'record_drill_voice_input';

const ALLOWED_ALLOY_KEYS = ['6061', '7075', 'a380'];

export function buildParseRequest(transcript) {
  return {
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    system:
      '你是鑽孔工藝顧問,專精鋁合金鑽孔的鑽頭選用邏輯。使用者會用中文說出一段話,內容通常包含鑽頭直徑(公制,單位 mm)與鋁合金材質。' +
      '請從這段話中萃取出直徑與材質,呼叫 record_drill_voice_input 工具回報結果。' +
      '直徑必須是 1 到 32 之間的數字(mm)。材質只能是 "6061"、"7075"、"a380" 三種鍵值之一(A380 壓鑄鋁也算 a380)。' +
      '如果這段話沒有明確提到直徑或材質,或是你無法判斷,對應欄位直接省略,絕對不要用猜測值。',
    tools: [
      {
        name: VOICE_INPUT_TOOL_NAME,
        description:
          '回報從語音文字中解析出的鑽頭直徑與鋁合金材質,任一欄位無法判斷時省略該欄位,不猜測。',
        input_schema: {
          type: 'object',
          properties: {
            diameter: {
              type: 'number',
              description: '鑽頭直徑,單位 mm,例如 8。無法判斷時不要包含這個欄位。'
            },
            alloy: {
              type: 'string',
              enum: ALLOWED_ALLOY_KEYS,
              description: '鋁合金材質鍵值。無法判斷時不要包含這個欄位。'
            }
          }
        }
      }
    ],
    tool_choice: { type: 'tool', name: VOICE_INPUT_TOOL_NAME },
    messages: [{ role: 'user', content: transcript }]
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/parse-drill-voice/promptBuilder.js supabase/functions/parse-drill-voice/promptBuilder.test.js
git commit -m "feat: build forced tool-call Anthropic request for voice parsing"
```

---

### Task 5: `parseAiResponse.js` — 驗證 AI 回傳的 tool input

**Files:**
- Create: `supabase/functions/parse-drill-voice/parseAiResponse.js`
- Test: `supabase/functions/parse-drill-voice/parseAiResponse.test.js`

**Interfaces:**
- Produces: `parseVoiceToolInput(toolInput: unknown): { diameter: number, alloy: string } | null`
- Consumes: nothing directly, but the shape it validates is exactly what Task 4's `input_schema` describes (`diameter: number`, `alloy: one of '6061'|'7075'|'a380'`) — Task 6 passes it the `tool_use` block's `.input` field from the Anthropic SDK response.

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/parse-drill-voice/parseAiResponse.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVoiceToolInput } from './parseAiResponse.js';

test('accepts a complete, in-range result', () => {
  assert.deepEqual(parseVoiceToolInput({ diameter: 8, alloy: '6061' }), { diameter: 8, alloy: '6061' });
});

test('rejects a missing diameter', () => {
  assert.equal(parseVoiceToolInput({ alloy: '6061' }), null);
});

test('rejects a missing alloy', () => {
  assert.equal(parseVoiceToolInput({ diameter: 8 }), null);
});

test('rejects an alloy outside the known set', () => {
  assert.equal(parseVoiceToolInput({ diameter: 8, alloy: 'titanium' }), null);
});

test('rejects a diameter outside the valid drill range', () => {
  assert.equal(parseVoiceToolInput({ diameter: 0, alloy: '6061' }), null);
  assert.equal(parseVoiceToolInput({ diameter: 999, alloy: '6061' }), null);
});

test('rejects a non-numeric diameter', () => {
  assert.equal(parseVoiceToolInput({ diameter: '8', alloy: '6061' }), null);
});

test('rejects a null or missing tool input', () => {
  assert.equal(parseVoiceToolInput(null), null);
  assert.equal(parseVoiceToolInput(undefined), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `parseAiResponse.js` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/parse-drill-voice/parseAiResponse.js`:

```js
const ALLOWED_ALLOY_KEYS = ['6061', '7075', 'a380'];
const MIN_DIAMETER = 1;
const MAX_DIAMETER = 32;

export function parseVoiceToolInput(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return null;
  const { diameter, alloy } = toolInput;
  if (typeof diameter !== 'number' || !Number.isFinite(diameter)) return null;
  if (diameter < MIN_DIAMETER || diameter > MAX_DIAMETER) return null;
  if (typeof alloy !== 'string' || !ALLOWED_ALLOY_KEYS.includes(alloy)) return null;
  return { diameter, alloy };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/parse-drill-voice/parseAiResponse.js supabase/functions/parse-drill-voice/parseAiResponse.test.js
git commit -m "feat: validate AI tool output for voice input parsing"
```

---

### Task 6: `index.ts` — Edge Function 入口(串接 Deno/Supabase/Anthropic)

**Files:**
- Create: `supabase/functions/parse-drill-voice/index.ts`

**Interfaces:**
- Consumes: `validateTranscript` (Task 2), `isRateLimited` + `HOURLY_REQUEST_LIMIT` (Task 3), `buildParseRequest` + `VOICE_INPUT_TOOL_NAME` (Task 4), `parseVoiceToolInput` (Task 5).
- Produces: an HTTP endpoint. Response bodies the frontend (next plan) depends on:
  - `401 { ok: false, code: 'NOT_AUTHENTICATED' }`
  - `400 { ok: false, code: 'EMPTY' | 'TOO_LONG' | 'INVALID_BODY' }`
  - `429 { ok: false, code: 'RATE_LIMITED', limit: number }`
  - `502 { ok: false, code: 'AI_UNAVAILABLE' }`
  - `200 { ok: false, code: 'PARSE_FAILED' }` (AI ran but couldn't extract both fields)
  - `200 { ok: true, diameter: number, alloy: string }`

This file runs on Deno (Supabase Edge Functions), not Node — it is **not** picked up by `npm test` (no `.test.js` file for it) and is verified manually in Task 7. `@ts-nocheck` is used because this repo has no TypeScript toolchain configured for Node; type-checking happens implicitly when Supabase deploys it.

- [ ] **Step 1: Write the implementation**

Create `supabase/functions/parse-drill-voice/index.ts`:

```ts
// @ts-nocheck
// Deno runtime (Supabase Edge Functions) — not run by the repo's Node test suite.
import { createClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';
import { validateTranscript } from './validateInput.js';
import { isRateLimited, HOURLY_REQUEST_LIMIT } from './rateLimit.js';
import { buildParseRequest, VOICE_INPUT_TOOL_NAME } from './promptBuilder.js';
import { parseVoiceToolInput } from './parseAiResponse.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');

  const supabaseAuth = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse({ ok: false, code: 'NOT_AUTHENTICATED' }, 401);
  }
  const userId = userData.user.id;

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, code: 'INVALID_BODY' }, 400);
  }

  const validation = validateTranscript(body?.transcript);
  if (!validation.valid) {
    return jsonResponse({ ok: false, code: validation.reason }, 400);
  }
  const transcript = body.transcript.trim();

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabaseAdmin
    .from('ai_usage')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', oneHourAgo);

  if (countError) {
    return jsonResponse({ ok: false, code: 'SERVER_ERROR' }, 500);
  }
  if (isRateLimited(count ?? 0)) {
    return jsonResponse({ ok: false, code: 'RATE_LIMITED', limit: HOURLY_REQUEST_LIMIT }, 429);
  }

  const anthropic = new Anthropic({ apiKey: anthropicApiKey });
  let aiResponse;
  try {
    aiResponse = await anthropic.messages.create(buildParseRequest(transcript));
  } catch {
    return jsonResponse({ ok: false, code: 'AI_UNAVAILABLE' }, 502);
  }

  // Every request that reaches this point already cost a real AI call, so it
  // counts toward the hourly limit whether or not parsing succeeds.
  await supabaseAdmin.from('ai_usage').insert({ user_id: userId });

  const toolUseBlock = aiResponse.content.find(
    (block) => block.type === 'tool_use' && block.name === VOICE_INPUT_TOOL_NAME
  );
  const parsed = toolUseBlock ? parseVoiceToolInput(toolUseBlock.input) : null;

  if (!parsed) {
    return jsonResponse({ ok: false, code: 'PARSE_FAILED' }, 200);
  }

  return jsonResponse({ ok: true, diameter: parsed.diameter, alloy: parsed.alloy }, 200);
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/parse-drill-voice/index.ts
git commit -m "feat: wire parse-drill-voice edge function handler"
```

---

### Task 7: 部署與手動驗證

**Files:** none (infrastructure/deploy step, plus a checklist to run through manually)

**Interfaces:** none — this task applies Task 1's migration and deploys Task 6's function to the live Supabase project (`eefnzpqveljowridmhto`).

**用 `npx supabase@latest`(Node.js 本身就有,不用另外裝)搭配 Personal Access Token(PAT)透過環境變數授權,不用互動式瀏覽器登入。**(原本計畫想用 Docker 的 `supabase/cli` image,但這個 image 並不存在——Docker Hub 上沒有官方發布的 Supabase CLI image,只有 postgres/storage 等元件的 image,所以改回 npx。)

- [ ] **Step 1: 產生 Supabase Personal Access Token**

1. 打開 https://supabase.com/dashboard ,Ctrl+K 搜尋 `Access Tokens`,或直接連到 https://supabase.com/dashboard/account/tokens
2. 點 **Generate new token**,取個名字(例如 `drill-selection-system-cli`),Expires in 選預設值即可,產生後複製起來(`sbp_` 開頭的一長串)——這把 token 等同你整個 Supabase 帳號的操作權限,**只在終端機環境變數裡用,不要貼進任何檔案或 git**

- [ ] **Step 2: 驗證 token 可用**

```bash
SUPABASE_ACCESS_TOKEN="<貼上 Step 1 拿到的 token>" npx --yes supabase@latest projects list
```

Expected: 印出一份 JSON,`ref` 是 `eefnzpqveljowridmhto`、`name` 是 `YUAN-117's Project`。（`Cannot find project ref. Have you run supabase link?` 這行警告是正常的,還沒 link 本來就會有,不影響。）

- [ ] **Step 3: 連結到現有的 Supabase 專案**

```bash
SUPABASE_ACCESS_TOKEN="<token>" npx --yes supabase@latest link --project-ref eefnzpqveljowridmhto
```

- [ ] **Step 4: 套用 migration(建立 `ai_usage` 表)**

```bash
SUPABASE_ACCESS_TOKEN="<token>" npx --yes supabase@latest db push
```

Expected: 終端機顯示 `20260823000000_create_ai_usage.sql` 已套用成功。可以到 Supabase 後台的 Table Editor 確認 `ai_usage` 表出現,欄位為 `id`、`user_id`、`created_at`。

- [ ] **Step 5: 部署 Edge Function**

```bash
SUPABASE_ACCESS_TOKEN="<token>" npx --yes supabase@latest functions deploy parse-drill-voice
```

Expected: 終端機顯示部署成功,並給出函式的呼叫網址(格式類似 `https://eefnzpqveljowridmhto.supabase.co/functions/v1/parse-drill-voice`)。

- [ ] **Step 6: 手動驗證(瀏覽器 DevTools 或 curl)**

因為這支函式需要登入者的 access token,最簡單的驗證方式是等前端那份計畫(下一份 plan)做完、能在瀏覽器裡登入後直接點麥克風測試。若想在前端完成前先驗證函式本身能跑:

1. 未帶 Authorization header 呼叫,應該收到 `401 { ok: false, code: 'NOT_AUTHENTICATED' }`。
2. 確認 Supabase 後台 Edge Functions → `parse-drill-voice` 的 Logs 分頁看得到剛剛這次呼叫的紀錄。

- [ ] **Step 7: Commit(如果 Step 2-5 有產生任何本機設定檔變更,例如 `supabase/.temp/` 或 `.gitignore` 需要更新)**

```bash
git status
```

檢查有沒有 Supabase CLI 產生的本機暫存檔需要加進 `.gitignore`(例如 `supabase/.temp/`)。如果有,加進 `.gitignore` 並 commit;如果沒有變更,這步跳過。
