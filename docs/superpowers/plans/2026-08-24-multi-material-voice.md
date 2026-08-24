# 多材料鑽頭選擇 — AI 語音輸入擴充 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the `parse-drill-voice` Edge Function's recognized workpiece materials from 3 aluminum alloys to all 8 material:subtype keys the tool now supports (`docs/superpowers/plans/2026-08-24-multi-material-core-ui.md`), and rename the `alloy` field to `material` end-to-end so voice results plug straight into the new `#material` select.

**Architecture:** Same Edge Function, same forced-tool-call design — only the allowed-key list and field name change. No new files, no new anti-abuse logic, no cost-relevant change (a slightly longer enum in the prompt/schema, negligible token impact).

**Tech Stack:** Same as the rest of the AI voice input feature — Deno Edge Function with plain JS pure-logic files tested via Node, `index.ts` and `voiceInputController.js` manually verified.

**Spec:** [docs/superpowers/specs/2026-08-24-multi-material-drill-selection-design.md](../specs/2026-08-24-multi-material-drill-selection-design.md) — "AI 語音輸入的擴充範圍" section.

**Depends on:** `docs/superpowers/plans/2026-08-24-multi-material-core-ui.md` must be done first — this plan's allowed-key list must match the `WORKPIECE_MATERIALS` keys that plan creates, and the frontend's `#material` select (also from that plan) is what this plan's voice results get written into.

## Global Constraints

- 允許辨識的材料鍵值(8 個,跟核心計畫的 `WORKPIECE_MATERIALS` 一致,**不含** `aluminum:custom`):`aluminum:6061`、`aluminum:7075`、`aluminum:a380`、`copper:brass`、`stainless:standard`、`peek:standard`、`pc:standard`、`pom:standard`。
- 欄位名稱從 `alloy` 全面改成 `material`——AI 工具 schema 的屬性名稱、`parseVoiceToolInput` 回傳物件的欄位、Edge Function 回應 JSON 的欄位、前端讀取的欄位,全部一致改名,不留舊名。
- **這次不解析「鑽頭材質」**——語音只負責直徑跟工件材料,`#drillMat` 維持使用者原本選的值不變。
- 沿用既有的防濫用機制(每小時 15 次、輸入 ≤100 字)不變,這次不改動 `rateLimit.js`/`validateInput.js`。
- 沿用既有測試風格:純函式(`promptBuilder.js`、`parseAiResponse.js`)用 Node 單元測試;`index.ts`、`voiceInputController.js` 手動驗證,不寫自動化測試。

---

### Task 1: `promptBuilder.js` — 擴充允許辨識的材料清單

**Files:**
- Modify: `supabase/functions/parse-drill-voice/promptBuilder.js`
- Modify: `supabase/functions/parse-drill-voice/promptBuilder.test.js`

**Interfaces:**
- Produces: `buildParseRequest(transcript): object`(不變簽名,`tools[0].input_schema.properties` 的欄位從 `alloy` 改成 `material`,`enum` 從 3 個值擴充成 8 個)

- [ ] **Step 1: Write the failing tests**

Replace the entire content of `supabase/functions/parse-drill-voice/promptBuilder.test.js` with:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildParseRequest, VOICE_INPUT_TOOL_NAME } from './promptBuilder.js';

test('sends the transcript as the user message', () => {
  const req = buildParseRequest('8mm 不鏽鋼');
  assert.equal(req.messages.length, 1);
  assert.equal(req.messages[0].role, 'user');
  assert.equal(req.messages[0].content, '8mm 不鏽鋼');
});

test('forces the tool call so the response is always structured', () => {
  const req = buildParseRequest('8mm 不鏽鋼');
  assert.deepEqual(req.tool_choice, { type: 'tool', name: VOICE_INPUT_TOOL_NAME });
  assert.equal(req.tools.length, 1);
  assert.equal(req.tools[0].name, VOICE_INPUT_TOOL_NAME);
});

test('restricts the material field to the eight known material:subtype keys', () => {
  const req = buildParseRequest('8mm 不鏽鋼');
  assert.deepEqual(req.tools[0].input_schema.properties.material.enum, [
    'aluminum:6061',
    'aluminum:7075',
    'aluminum:a380',
    'copper:brass',
    'stainless:standard',
    'peek:standard',
    'pc:standard',
    'pom:standard'
  ]);
});

test('the schema property is named material, not alloy', () => {
  const req = buildParseRequest('8mm 不鏽鋼');
  assert.ok(req.tools[0].input_schema.properties.material);
  assert.ok(!req.tools[0].input_schema.properties.alloy);
});

test('uses the Haiku model with a small max_tokens cap', () => {
  const req = buildParseRequest('8mm 不鏽鋼');
  assert.equal(req.model, 'claude-haiku-4-5');
  assert.ok(req.max_tokens <= 1000);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `promptBuilder.js` still has the `alloy` property with a 3-value enum.

- [ ] **Step 3: Write the implementation**

Replace the entire content of `supabase/functions/parse-drill-voice/promptBuilder.js` with:

```js
export const VOICE_INPUT_TOOL_NAME = 'record_drill_voice_input';

const ALLOWED_MATERIAL_KEYS = [
  'aluminum:6061',
  'aluminum:7075',
  'aluminum:a380',
  'copper:brass',
  'stainless:standard',
  'peek:standard',
  'pc:standard',
  'pom:standard'
];

export function buildParseRequest(transcript) {
  return {
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    system:
      '你是鑽孔工藝顧問,專精鋁合金、銅合金、不鏽鋼與工程塑膠(PEEK/PC/POM)的鑽孔鑽頭選用邏輯。使用者會用中文說出一段話,內容通常包含鑽頭直徑(公制,單位 mm)與工件材料。' +
      '請從這段話中萃取出直徑與材料,呼叫 record_drill_voice_input 工具回報結果。' +
      '直徑必須是 1 到 32 之間的數字(mm)。材料只能是以下鍵值之一:' +
      '"aluminum:6061"(鋁合金 6061)、"aluminum:7075"(鋁合金 7075)、"aluminum:a380"(鋁合金 A380 壓鑄鋁)、' +
      '"copper:brass"(黃銅/銅合金)、"stainless:standard"(不鏽鋼)、"peek:standard"(PEEK)、"pc:standard"(PC/聚碳酸酯)、"pom:standard"(POM/Delrin/賽鋼)。' +
      '如果這段話沒有明確提到直徑或材料,或是你無法判斷對應哪個鍵值,對應欄位直接省略,絕對不要用猜測值。',
    tools: [
      {
        name: VOICE_INPUT_TOOL_NAME,
        description:
          '回報從語音文字中解析出的鑽頭直徑與工件材料,任一欄位無法判斷時省略該欄位,不猜測。',
        input_schema: {
          type: 'object',
          properties: {
            diameter: {
              type: 'number',
              description: '鑽頭直徑,單位 mm,例如 8。無法判斷時不要包含這個欄位。'
            },
            material: {
              type: 'string',
              enum: ALLOWED_MATERIAL_KEYS,
              description: '工件材料鍵值,格式為「大類:子項」,例如 "stainless:standard"。無法判斷時不要包含這個欄位。'
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
Expected: PASS for `promptBuilder.test.js`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/parse-drill-voice/promptBuilder.js supabase/functions/parse-drill-voice/promptBuilder.test.js
git commit -m "feat: expand voice input to recognize all 8 workpiece material keys"
```

---

### Task 2: `parseAiResponse.js` — 驗證新的 material 欄位

**Files:**
- Modify: `supabase/functions/parse-drill-voice/parseAiResponse.js`
- Modify: `supabase/functions/parse-drill-voice/parseAiResponse.test.js`

**Interfaces:**
- Produces: `parseVoiceToolInput(toolInput: unknown): { diameter: number, material: string } | null`(欄位從 `alloy` 改成 `material`,允許清單從 3 個擴充成 8 個)

- [ ] **Step 1: Write the failing tests**

Replace the entire content of `supabase/functions/parse-drill-voice/parseAiResponse.test.js` with:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVoiceToolInput } from './parseAiResponse.js';

test('accepts a complete, in-range result for a new material', () => {
  assert.deepEqual(parseVoiceToolInput({ diameter: 8, material: 'stainless:standard' }), {
    diameter: 8,
    material: 'stainless:standard'
  });
});

test('accepts an aluminum result (existing behavior preserved)', () => {
  assert.deepEqual(parseVoiceToolInput({ diameter: 8, material: 'aluminum:6061' }), {
    diameter: 8,
    material: 'aluminum:6061'
  });
});

test('rejects a missing diameter', () => {
  assert.equal(parseVoiceToolInput({ material: 'stainless:standard' }), null);
});

test('rejects a missing material', () => {
  assert.equal(parseVoiceToolInput({ diameter: 8 }), null);
});

test('rejects a material outside the known set', () => {
  assert.equal(parseVoiceToolInput({ diameter: 8, material: 'titanium:standard' }), null);
});

test('rejects the bare old-style key without a category prefix', () => {
  assert.equal(parseVoiceToolInput({ diameter: 8, material: '6061' }), null);
});

test('rejects aluminum:custom (never offered to the AI)', () => {
  assert.equal(parseVoiceToolInput({ diameter: 8, material: 'aluminum:custom' }), null);
});

test('rejects a diameter outside the valid drill range', () => {
  assert.equal(parseVoiceToolInput({ diameter: 0, material: 'aluminum:6061' }), null);
  assert.equal(parseVoiceToolInput({ diameter: 999, material: 'aluminum:6061' }), null);
});

test('rejects a non-numeric diameter', () => {
  assert.equal(parseVoiceToolInput({ diameter: '8', material: 'aluminum:6061' }), null);
});

test('rejects a null or missing tool input', () => {
  assert.equal(parseVoiceToolInput(null), null);
  assert.equal(parseVoiceToolInput(undefined), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `parseVoiceToolInput` still reads `toolInput.alloy` and validates against the old 3-key list.

- [ ] **Step 3: Write the implementation**

Replace the entire content of `supabase/functions/parse-drill-voice/parseAiResponse.js` with:

```js
const ALLOWED_MATERIAL_KEYS = [
  'aluminum:6061',
  'aluminum:7075',
  'aluminum:a380',
  'copper:brass',
  'stainless:standard',
  'peek:standard',
  'pc:standard',
  'pom:standard'
];
const MIN_DIAMETER = 1;
const MAX_DIAMETER = 32;

export function parseVoiceToolInput(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return null;
  const { diameter, material } = toolInput;
  if (typeof diameter !== 'number' || !Number.isFinite(diameter)) return null;
  if (diameter < MIN_DIAMETER || diameter > MAX_DIAMETER) return null;
  if (typeof material !== 'string' || !ALLOWED_MATERIAL_KEYS.includes(material)) return null;
  return { diameter, material };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS for `parseAiResponse.test.js` and `promptBuilder.test.js`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/parse-drill-voice/parseAiResponse.js supabase/functions/parse-drill-voice/parseAiResponse.test.js
git commit -m "feat: validate the expanded material field in voice parse responses"
```

---

### Task 3: `index.ts` — 回應欄位改名

**Files:**
- Modify: `supabase/functions/parse-drill-voice/index.ts`

**Interfaces:**
- Consumes: `parseVoiceToolInput` (Task 2, now returns `{diameter, material}`)
- Produces: HTTP response body `{ ok: true, diameter: number, material: string }` on success (取代舊的 `alloy` 欄位)

This file is not run by `node --test` (Deno-only, matches existing project convention) — no automated test, just an exact code change.

- [ ] **Step 1: 修改回應欄位**

In `supabase/functions/parse-drill-voice/index.ts`, find this line near the end of the file:

```ts
  return jsonResponse({ ok: true, diameter: parsed.diameter, alloy: parsed.alloy }, 200);
```

Replace it with:

```ts
  return jsonResponse({ ok: true, diameter: parsed.diameter, material: parsed.material }, 200);
```

No other line in this file references `alloy` — the rest of the request/response handling (auth, rate limit, input validation, Anthropic call, error codes) is unchanged.

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/parse-drill-voice/index.ts
git commit -m "feat: rename the edge function's alloy response field to material"
```

---

### Task 4: `voiceInputController.js` — 前端接住新的 material 欄位

**Files:**
- Modify: `assets/ui/voiceInputController.js`

**Interfaces:**
- Consumes: `result.material` from `parseVoiceInput` (Task 3's Edge Function response, unchanged client-side `voiceParseClient.js`/`voiceInputView.js` — neither file references `alloy` anywhere, so neither needs to change); DOM element `#material` (created by `docs/superpowers/plans/2026-08-24-multi-material-core-ui.md`'s Task 3, replacing the old `#alloy`)

This file touches `document`/network — not unit tested, verified manually (Task 5).

- [ ] **Step 1: 修改元素參照與欄位名稱**

In `assets/ui/voiceInputController.js`, find this line:

```js
const alloyEl = document.getElementById('alloy');
```

Replace it with:

```js
const materialEl = document.getElementById('material');
```

Find this function:

```js
function fillFormAndRecompute(diameter, alloy) {
  diameterEl.value = diameter;
  alloyEl.value = alloy;
  diameterEl.dispatchEvent(new Event('input', { bubbles: true }));
  alloyEl.dispatchEvent(new Event('change', { bubbles: true }));
}
```

Replace it with:

```js
function fillFormAndRecompute(diameter, material) {
  diameterEl.value = diameter;
  materialEl.value = material;
  diameterEl.dispatchEvent(new Event('input', { bubbles: true }));
  materialEl.dispatchEvent(new Event('change', { bubbles: true }));
}
```

Find this line inside `handleTranscript`:

```js
  fillFormAndRecompute(result.diameter, result.alloy);
```

Replace it with:

```js
  fillFormAndRecompute(result.diameter, result.material);
```

Nothing else in this file references `alloy` — the rest (mic button state, login check, error display, `addVoiceHistoryRecord` call) is unchanged. Note `addVoiceHistoryRecord(localStorage, transcript, result.diameter, result.alloy)` in the same function also needs its last argument updated:

```js
  addVoiceHistoryRecord(localStorage, transcript, result.diameter, result.material);
```

(The voice-input history log's own record shape — separate from the main calculator's history — isn't changing field names beyond this call-site rename; `voiceHistoryStore.js` just stores whatever value it's given under its existing `alloy`-agnostic `diameter`/`alloy` parameter names. If you want that store's own parameter name updated for consistency too, that's optional polish outside this plan's scope — the stored data works correctly either way since `voiceHistoryStore.js` doesn't validate or interpret the value, just persists it.)

- [ ] **Step 2: Commit**

```bash
git add assets/ui/voiceInputController.js
git commit -m "feat: read the renamed material field from voice parse results"
```

---

### Task 5: 重新部署 Edge Function 並手動驗證

**Files:** none — deploy + manual browser verification, matching the deploy pattern already established for this project.

- [ ] **Step 1: 部署**

```bash
SUPABASE_ACCESS_TOKEN="<Supabase Personal Access Token,同上次部署用的>" npx --yes supabase@latest functions deploy parse-drill-voice
```

Expected: 終端機顯示部署成功。

- [ ] **Step 2: 手動驗證 — 新材料語音辨識**

在瀏覽器打開 `tool.html`(需先確認 `docs/superpowers/plans/2026-08-24-multi-material-core-ui.md` 已經做完,`#material` 選單存在),登入後點麥克風,依序測試幾句話:
- 「8mm 不鏽鋼」→ 確認材料材質選單跳到「不鏽鋼」,直徑填 8,下方結果算出來
- 「10mm PC」或「10mm 聚碳酸酯」→ 確認材料材質選單跳到「PC(通用)」
- 確認每次語音填完後,「鑽頭材質」選單維持使用者原本選的值,不會被語音結果改動

- [ ] **Step 3: 手動驗證 — 解析失敗與既有行為不受影響**

說一句無關的話(例如「今天天氣真好」),確認顯示「聽不懂,請重新說一次」,材料材質/直徑欄位不變。確認每小時 15 次上限、100 字輸入上限這些既有防濫用機制沒有被這次改動影響(不用重新整輪測試,確認 Edge Function 部署成功、`rateLimit.js`/`validateInput.js` 這次沒有改動即可)。
