# 專案交接筆記(給接手的 AI 助理看)

這份檔案是給接手這個專案的 AI 助理(例如 Cursor 裡的 Claude)看的,說明目前進度跟接下來該做什麼。使用者不熟悉技術細節,請用繁體中文、一步一步地引導。

## 專案是什麼

`鑽頭選擇系統`:鋁合金鑽孔的鑽頭材質比較與轉速/進給量計算工具。

## 目前已完成、穩定運作的部分

- **基礎靜態網站已上線**:https://yuan-117.github.io/drill-selection-system/
  - GitHub repo:`YUAN-117/drill-selection-system`(public),對應這個資料夾的 `master` 分支
  - 純前端(HTML/CSS/ES Module JS),無後端,部署在 GitHub Pages
  - 架構文件:[`docs/superpowers/specs/2026-08-22-drill-selection-website-design.md`](docs/superpowers/specs/2026-08-22-drill-selection-website-design.md)
  - 實作計畫(已全部執行完成、通過測試與最終審查):[`docs/superpowers/plans/2026-08-22-drill-selection-website.md`](docs/superpowers/plans/2026-08-22-drill-selection-website.md)
  - 程式碼分層:`assets/core/`(純計算邏輯,有 Node 單元測試)、`assets/data/`(localStorage 存取)、`assets/ui/`(畫面渲染 + DOM 操作分開)
  - 跑測試:`npm test`(24 個測試,應該全過)
  - **這部分已經完成,不需要再改動**,除非使用者明確要求

## 現在要做的:AI 語音輸入 + Google 登入功能(進行中,還沒開始寫程式)

**規格文件已經寫好、已 commit**,完整細節都在這裡,請先讀過:
[`docs/superpowers/specs/2026-08-22-ai-voice-input-login-design.md`](docs/superpowers/specs/2026-08-22-ai-voice-input-login-design.md)

規格重點(不要重新設計,已跟使用者確認過):
- 只做 **Google 登入**(不做信箱註冊),用 **Supabase Auth**
- 後端用 **Supabase**(Auth + Edge Function),前端維持純靜態不變
- AI 用 **Anthropic Claude Haiku**,單次獨立解析語音文字成 `{ diameter, alloy }`,不需要多輪對話記憶
- 防濫用:每帳號**每小時 15 次**請求上限、單次輸入文字**不超過 100 字**、AI 回覆要設 `max_tokens` 限制長度
- 語音輸入紀錄(最近 20 筆)存在瀏覽器 **localStorage**,跟現有 `assets/data/historyStore.js` 同樣的依賴注入 `storage` 參數寫法
- **只有 AI 語音輸入這個功能需要登入**,現有計算器與歷史紀錄頁維持免登入、不要改動
- 解析失敗時**整欄不填**,顯示錯誤訊息要求使用者重講一次,不要做部分猜測填入
- 這次**不做付費機制**,只用次數上限防濫用

### 外部帳號設定進度(這些不在 git 裡,只能看這份筆記知道)

- ✅ Supabase 帳號 + 專案已建立(專案 URL:`https://eefnzpqveljowridmhto.supabase.co`)
- ✅ Google Cloud 專案 `drill-selection-system` 已建立
- ✅ Google OAuth 同意畫面(Google Auth Platform)已設定完成,使用者類型為外部(External)
- ✅ Google OAuth Client(`drill-selection-system web`,Web application 類型)已建立,redirect URI 已指向 Supabase callback network
- ✅ Client ID / Client Secret 已貼回 Supabase 的 Google Provider 設定並儲存,「Skip nonce checks」已確認關閉、Google 登入已啟用
- ⏳ **Anthropic API 金鑰:上次對話在這裡暫停**,還沒確認使用者是否已完成申請 API 金鑰、設定好帳單付款方式。**請先跟使用者確認這一步是否完成**,完成才能繼續下一步

### 接下來的步驟

1. **先問使用者**:Anthropic API 金鑰申請好了嗎?帳單/付款方式設定好了嗎?
2. 金鑰確認好之後,引導使用者把金鑰設定進 **Supabase Edge Function 的環境變數**(用 Supabase 後台介面,或 `supabase secrets set ANTHROPIC_API_KEY=xxx` 指令),**金鑰絕對不能出現在前端程式碼或 commit 進 git**
3. 照這個專案已經在用的流程繼續:
   - 用 `superpowers:brainstorming` 或直接確認規格細節都問清楚了(規格文件應該已經足夠完整,可以直接進入下一步)
   - 用 `superpowers:writing-plans` 把 spec 拆成 TDD 實作計畫,存到 `docs/superpowers/plans/`
   - 用 `superpowers:subagent-driven-development`(如果工具支援)或一般方式逐步實作、測試、review
4. 實作範圍大致包含:
   - `tool.html` 新增麥克風按鈕與登入狀態顯示
   - 前端新增呼叫瀏覽器語音辨識(Web Speech API)的邏輯
   - 前端新增呼叫 Supabase Auth(Google 登入)與呼叫 Edge Function 的 `data` 層邏輯
   - Supabase Edge Function:驗證登入、檢查每小時次數上限、檢查輸入長度、呼叫 Anthropic API、驗證回應格式、回傳結果
   - 語音輸入紀錄(最近 20 筆)的 localStorage 存取邏輯(仿照 `historyStore.js`)

## 溝通注意事項

- **一律用繁體中文回覆**,包括工具/框架帶出來的英文樣板文字也要翻譯
- 使用者對這類外部平台(Supabase、Google Cloud)介面操作不熟悉,引導時**一次只給一小段具體指示**(哪個按鈕、哪個欄位填什麼),等使用者回報結果再給下一步,不要一次丟一大串步驟
- 涉及金鑰、密碼等機密資訊,**只引導使用者自己複製貼上,不要主動索取或要求對方貼給你看**
- 帳號註冊、金流設定這類事情**無法代辦**,只能引導使用者自己操作
