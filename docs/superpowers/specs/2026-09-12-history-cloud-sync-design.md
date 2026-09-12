# 歷史紀錄雲端同步 — 設計規格

## 背景與目的

`history.html` 的計算歷史紀錄目前完全存在瀏覽器的 `localStorage`,換一台電腦、換瀏覽器、或清除瀏覽器資料就會遺失。這次擴充:讓已用 Google 帳號登入的使用者,歷史紀錄改存到 Supabase 資料庫,跨裝置都看得到同一份紀錄。

這是[[project-drill-selection-deep-hole]]完成後,原本就排定的下一步——刻意排在多材料擴充、攻牙底孔查詢、深孔鑽提醒之後,因為深孔鑽提醒改動了歷史紀錄物件的欄位形狀(新增 `depth`、`deepHoleWarning`),先讓欄位定案再設計資料庫 schema,才不用改兩次。

## 範圍

**這次要做的:**
- 新增 Supabase 資料表 `drill_history`,搭配 RLS 讓使用者只能存取自己的紀錄
- 新增 `assets/data/cloudHistoryStore.js`(async,呼叫 Supabase)
- 新增 `assets/data/historyGateway.js`,依登入狀態統一分流「該用本機還是雲端」
- `historyController.js` 改成登入感知:登入用雲端、未登入用本機,並處理載入中/錯誤狀態
- `toolController.js` 的「加入記錄」按鈕改成登入感知,並處理新增失敗的錯誤狀態
- `history.html` 新增登入狀態列(比照 `tool.html` 既有樣式)+ 錯誤提示區塊,頁首說明文字依登入狀態動態切換

**明確不做(這次範圍外):**
- **不強制登入才能用歷史紀錄**——未登入沿用現有 localStorage 行為,不影響既有使用者
- **不搬移舊的本機紀錄到雲端**——登入後雲端紀錄從空的開始,本機的舊紀錄留在瀏覽器裡但登入後的畫面不會顯示它們(login/logout 切換時,是「切換資料來源」,不是「合併資料來源」)
- **不同步語音輸入的內部逐字稿記錄(`voiceHistoryStore.js`)**——那是獨立的除錯用途記錄,只套用在主計算機的歷史紀錄
- **不設筆數上限**——歷史紀錄新增只是寫入資料庫,不像語音輸入會呼叫按次計費的外部 API,沒有「別人亂用就變成你的帳單」這種急迫性;以 Supabase 本身的資料庫容量上限當最後防線就好
- **不做樂觀更新(optimistic UI)**——新增/刪除都等雲端操作確認成功才更新畫面,失敗要看得出來,不假裝成功

## 資料庫設計

新增 migration `supabase/migrations/<timestamp>_create_drill_history.sql`:

```sql
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

**設計理由:**
- `record` 用單一 `jsonb` 欄位存整包紀錄物件(`diameter`/`materialKey`/`subtypeKey`/`drillMat`/`depth`/`deepHoleWarning`/`result` 等),不拆成獨立欄位——這個功能不需要在資料庫端依欄位篩選查詢,只需要「拿我自己的全部紀錄」,存 JSON 最簡單,`historyStore.js` 的紀錄形狀改變時(未來如果再擴充欄位)也不用跟著改 schema
- 跟現有 `ai_usage` 資料表(service-role-only、無 RLS policy)不同,這張表要讓客戶端直接讀寫,所以要有明確的 `select`/`insert`/`delete` policy,全部鎖 `auth.uid() = user_id`,確保使用者只能碰自己的資料
- 沒有 `update` policy——紀錄不會被修改,只會新增或刪除
- `id` 用 `bigint generated always as identity`,由資料庫產生,不像本機版的 `makeRecordId()` 由前端自己生字串 id;新增紀錄後要用 Supabase 的 `insert().select().single()` 拿到資料庫實際產生的那筆(含 id、created_at),回傳給畫面顯示,不能像本機版那樣自己先組一筆假設會成功的紀錄

## 模組結構

### `assets/data/historyStore.js`(不動)

維持現狀,純 `localStorage`、完全同步,只在使用者未登入時使用。

### `assets/data/cloudHistoryStore.js`(新增)

Async、呼叫 Supabase,對應本機版同樣的四個操作,回傳的紀錄物件形狀跟本機版一致(讓 `historyView.js` 不用改):

```js
export async function loadCloudHistory(supabase, userId) { ... }
// select * from drill_history where user_id = userId order by created_at desc
// 每一列轉成 { id: String(row.id), timestamp: row.created_at, ...row.record }

export async function addCloudHistoryRecord(supabase, userId, diameter, materialKey, subtypeKey, drillToolType, result, depth) { ... }
// 組出跟 historyStore.js 的 addHistoryRecord 同樣形狀的 record 物件(不含 id/timestamp)
// insert 一筆 { user_id: userId, record } 並 select().single() 拿回真正的 row
// 回傳轉換後的紀錄物件

export async function deleteCloudHistoryRecord(supabase, userId, id) { ... }
// delete from drill_history where id = id and user_id = userId

export async function clearCloudHistory(supabase, userId) { ... }
// delete from drill_history where user_id = userId
```

每個函式在 Supabase 呼叫失敗時(`error` 不是 `null`)拋出例外,由呼叫端(`historyGateway.js`)決定怎麼呈現錯誤,這一層本身不處理 UI。

### `assets/data/historyGateway.js`(新增)

依 `session` 有無決定要用本機還是雲端,把這個判斷集中在一個地方,`historyController.js` 跟 `toolController.js` 都只呼叫這一層:

```js
export async function loadRecords(session) { ... }
export async function addRecord(session, diameter, materialKey, subtypeKey, drillToolType, result, depth) { ... }
export async function deleteRecord(session, id) { ... }
export async function clearRecords(session) { ... }
```

內部邏輯:`session` 為 `null`/`undefined` 時呼叫 `historyStore.js` 的對應函式(用 `localStorage`,包一層讓回傳值變成 resolved Promise,統一介面都是 async);有 `session` 時呼叫 `cloudHistoryStore.js` 的對應函式,傳入 `session.user.id` 當 `userId`。

## Controller 變更

### `assets/ui/historyController.js`

- 進入頁面先呼叫 `getSession()`,並用 `onAuthStateChange` 監聽登入狀態變化(狀態改變時重新 `render()`)
- `render()` 改 async:先顯示「載入中...」,呼叫 `historyGateway.loadRecords(session)`,成功換成清單,失敗顯示錯誤訊息(見下方「載入中/錯誤狀態」)
- 刪除單筆/清空全部改成:呼叫 `historyGateway` 對應函式,**成功才 `render()` 更新畫面**;失敗則顯示錯誤提示,清單維持原狀不變(不會先移除畫面上的項目再等結果)
- 加入登入狀態列的 DOM 綁定與 `signInWithGoogle`/`onAuthStateChange`/`getSession` 呼叫,沿用 `voiceInputView.js` 既有的 `renderLoginStatus(session)`,不重寫這段邏輯

### `assets/ui/toolController.js`

`addBtn` 的點擊事件改成:
1. 先呼叫 `getSession()` 拿目前登入狀態(比照 `voiceInputController.js` 的 `startListening()` 既有寫法,在動作當下即時查詢,不做模組層級快取)
2. 按鈕文字先變成「加入中...」並暫時停用,避免使用者連點
3. 呼叫 `historyGateway.addRecord(session, ...)`
4. 成功→「已加入 ✓」;失敗→「加入失敗,請重試」;兩種狀態都在 1.2~2 秒後恢復成「加入記錄」並解除停用

## 畫面設計

### `history.html`

比照 `tool.html` 的登入列樣式,在 `panel` 開頭加入:

```html
<div class="login-status">
  <span id="loginStatus">檢查登入狀態...</span>
  <button class="btn-ghost" id="loginBtn" type="button">使用 Google 登入</button>
</div>
```

頁首說明文字改成依登入狀態動態切換(由 controller 更新 textContent):
- 未登入:「只保存在這個瀏覽器裡,換一台電腦或清除瀏覽器資料就看不到了」(維持現狀文字)
- 已登入:「已同步到雲端,登入同一個帳號就能在其他裝置看到」

新增錯誤提示區塊,放在 `historyList` 上方,樣式沿用現有 `confirm-bar` 的橫幅風格但用警示色:

```html
<div class="history-error" id="historyError" hidden></div>
```

### `tool.html`

不需要新增 DOM 元素,`addBtn` 的文字狀態直接在既有按鈕上切換(見上方 Controller 變更)。

## 載入中 / 錯誤狀態 UX

1. **歷史紀錄頁面初次載入**(已登入):`historyList` 顯示「載入中...」,拿到資料後換成清單;讀取失敗顯示「無法載入雲端紀錄,請檢查網路連線後重新整理」,不顯示空清單假裝沒有紀錄。
2. **刪除單筆/清空全部失敗**:`#historyError` 顯示對應錯誤文字(「刪除失敗,請稍後再試」/「清空失敗,請稍後再試」),清單維持原狀;下一次操作成功時清掉這個錯誤提示。
3. **主計算機頁面新增紀錄失敗**:`addBtn` 文字變成「加入失敗,請重試」,恢復成「加入記錄」後使用者可以直接再點一次重試,不需要額外的重試按鈕或彈窗。

## 測試策略

延續既有原則(三層架構:`core` 純函式單元測試、`data` 用假物件模擬儲存層單元測試、`ui/*Controller.js` 只做手動瀏覽器驗證):

- `cloudHistoryStore.js`:用假的 Supabase client 物件(模擬 `.from().select()`/`.insert()`/`.delete()` 的鏈式呼叫,回傳預先設定的 `{ data, error }`)寫單元測試,涵蓋成功案例跟 `error` 不為 `null` 時正確拋出例外
- `historyGateway.js`:用假的 `storage`(沿用 `historyStore.test.js` 的 `createMemoryStorage()` 寫法)跟假的 Supabase client,測試 `session` 為 `null` 時走本機、有 `session` 時走雲端的分流是否正確
- `historyController.js`/`toolController.js` 的登入感知邏輯、載入中/錯誤狀態畫面:手動瀏覽器驗證(Playwright),包含正常流程與模擬 Supabase 呼叫失敗時的錯誤提示是否正確顯示

## 未來可能擴充(明確不在這次範圍內)

- 舊本機紀錄一鍵搬到雲端的功能
- 歷史紀錄筆數上限或分頁載入(目前沒有,之後若資料庫真的異常肥大或有濫用跡象再加)
- 匯出成 CSV/列印(使用者先前提過的另一個潛在功能,跟這次無關,獨立評估)
