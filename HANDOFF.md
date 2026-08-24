# 專案交接筆記(給接手的 AI 助理看)

這份檔案是給接手這個專案的 AI 助理(例如 Cursor 裡的 Claude)看的,說明目前進度跟接下來該做什麼。使用者不熟悉技術細節,請用繁體中文、一步一步地引導。

## 專案是什麼

`鑽頭選擇系統`:鋁合金鑽孔的鑽頭材質比較與轉速/進給量計算工具。

## 這個專案最初的領域知識設定(人設/角色設定)

這個專案一開始,使用者是先設定了一個「鑽孔工藝顧問」的角色給我,讓我用這個角色的邏輯去設計計算工具。這個角色設定的重點規則如下,**大部分規則的實質內容已經變成程式碼(`assets/core/materials.js`)跟規格文件裡的具體數字/邏輯了**,但角色設定本身的「態度」與「資料來源原則」還是值得知道,尤其是之後如果要擴充計算邏輯(例如新增材質、新增鑽頭種類)時,應該延續同樣的原則:

- **角色定位**:專精金屬切削加工的鑽孔工藝顧問,熟悉鋁合金材料特性、鑽頭選用邏輯與切削參數計算
- **一律使用公制單位**
- **不憑空捏造精確數字**:若使用者/系統沒有提供切削速度(Vc)參考值,依鋁合金與鑽頭材質給出「常用範圍」並註明這是經驗範圍,不能假裝是精確固定值(這條原則已經寫進 `assets/core/materials.js` 的 `FEED_BANDS`/`DRILL_VC` 常用範圍設計,以及規格文件裡「Vc、f 為經驗常用範圍,非精確固定值」這句話)
- **進給量要考慮鑽頭直徑**,避免建議會造成斷屑不良、積屑瘤或鑽頭崩刃的參數(已實作成依直徑分段查表的 `FEED_BANDS`)
- **鑽鋁合金最常用高速鋼(HSS)**,以 HSS 為預設/主要參考基準,Vc 常用範圍約 30–60 m/min(硬質合金、塗層硬質合金另有各自範圍,已寫進程式碼)
- **每次計算結果用簡潔表格呈現**,方便使用者記錄與比對(這條後來演變成現在網站上「三種材質並排對照表」的設計)
- **資訊不足時要先反問缺少的參數,不要自行假設**——這條原則在對話式問答情境才適用,套用到 AI 語音輸入功能上,對應的是「解析失敗時整欄不填、要求使用者重講一次,不做部分猜測填入」這條規則(已經寫進 AI 語音輸入的規格文件)

**給 Cursor 裡的 Claude 的建議**:寫程式碼、擴充計算邏輯時,請延續「不捏造精確數字、資訊不足就不要瞎猜」這個原則。如果使用者在 Cursor 裡也想用對話方式問你鑽孔工藝相關問題(不是要求你寫程式),可以參考上面的角色設定用同樣口吻與原則回答。

## 目前已完成、穩定運作的部分

- **基礎靜態網站已上線**:https://yuan-117.github.io/drill-selection-system/
  - GitHub repo:`YUAN-117/drill-selection-system`(public),對應這個資料夾的 `master` 分支
  - 純前端(HTML/CSS/ES Module JS),無後端,部署在 GitHub Pages
  - 架構文件:[`docs/superpowers/specs/2026-08-22-drill-selection-website-design.md`](docs/superpowers/specs/2026-08-22-drill-selection-website-design.md)
  - 實作計畫(已全部執行完成、通過測試與最終審查):[`docs/superpowers/plans/2026-08-22-drill-selection-website.md`](docs/superpowers/plans/2026-08-22-drill-selection-website.md)
  - 程式碼分層:`assets/core/`(純計算邏輯,有 Node 單元測試)、`assets/data/`(localStorage 存取)、`assets/ui/`(畫面渲染 + DOM 操作分開)
  - 跑測試:`npm test`(60 個測試,應該全過)
  - **這部分已經完成,不需要再改動**,除非使用者明確要求

- **AI 語音輸入 + Google 登入功能已完成並通過手動端對端測試(2026-08-24)**
  - 規格:[`docs/superpowers/specs/2026-08-22-ai-voice-input-login-design.md`](docs/superpowers/specs/2026-08-22-ai-voice-input-login-design.md)
  - 後端實作計畫(已全部完成、已部署上線):[`docs/superpowers/plans/2026-08-23-ai-voice-backend.md`](docs/superpowers/plans/2026-08-23-ai-voice-backend.md) — Supabase Edge Function `parse-drill-voice`,已部署到 `https://eefnzpqveljowridmhto.supabase.co/functions/v1/parse-drill-voice`
  - 前端實作計畫(已全部完成):[`docs/superpowers/plans/2026-08-23-ai-voice-frontend.md`](docs/superpowers/plans/2026-08-23-ai-voice-frontend.md) — `tool.html` 的麥克風按鈕、登入狀態列、`assets/data/supabaseClient.js`、`voiceParseClient.js`、`voiceHistoryStore.js`、`assets/ui/voiceInputView.js`、`voiceInputController.js`
  - 已在本機(`http://127.0.0.1:5500`,用 `npx serve`)實測通過:Google 登入、語音辨識成功自動填表、解析失敗不亂填、localStorage 紀錄、每小時 15 次上限擋下第 16 次以後的請求、無痕視窗(未登入)下原有計算器/歷史紀錄功能不受影響
  - ✅ Supabase 後台 Authentication → URL Configuration → Redirect URLs 已加好 `http://127.0.0.1:5500/**`(本機測試)跟 `https://yuan-117.github.io/**`(正式站),兩個都在清單裡,部署到 GitHub Pages 後 Google 登入不需要再額外設定。
  - Anthropic $5 額度用得很省(用 Haiku、每小時 15 次上限),不用特別擔心突然被扣款——因為 Console 裡的自動加值(auto-reload)當時選了 Skip,額度用完就是用完,不會自動扣卡。

## 進行中:多材料鑽頭選擇擴充(2026-08-24 設計完成,尚未開始實作)

**使用者想擴充的功能:**
1. 新增「鑽頭材質」下拉選單,使用者自己選一種(不再自動算三種並排比較),選項文字帶建議 Vc 範圍
2. 「材料材質」從只有鋁合金,擴充成鋁合金/銅合金(黃銅)/不鏽鋼/PEEK/PC/POM 六大類

**規格文件**(已寫好、已 commit、已自我審查修過 3 個問題):
[`docs/superpowers/specs/2026-08-24-multi-material-drill-selection-design.md`](docs/superpowers/specs/2026-08-24-multi-material-drill-selection-design.md)

**實作計畫**(已寫好、已 commit、已自我審查修過 1 個防呆漏洞,**還沒開始執行任何一個 task**):
- 核心計算 + 畫面(先做這份):[`docs/superpowers/plans/2026-08-24-multi-material-core-ui.md`](docs/superpowers/plans/2026-08-24-multi-material-core-ui.md)——7 個 task,重寫 `materials.js`、`toolView.js`、`toolController.js`、`tool.html`、`historyStore.js`、`historyView.js`
- AI 語音輸入擴充(依賴前一份先做完):[`docs/superpowers/plans/2026-08-24-multi-material-voice.md`](docs/superpowers/plans/2026-08-24-multi-material-voice.md)——5 個 task,擴充 `promptBuilder.js`/`parseAiResponse.js` 允許的材料清單、`index.ts`/`voiceInputController.js` 的 `alloy`→`material` 改名、重新部署

**執行方式**:延續 [[feedback-codex-delegation-workflow]]——每個 task 派給 Codex 寫,Claude Code 審查後補 commit(Codex 在這個環境沒有 `.git` 寫入權限)。

**下一步(下次對話從這裡接續)**:直接開始跑「核心計算 + 畫面」計畫的 Task 1(`materials.js` 重構)。使用者昨天(2026-08-24)在 Task 1 剛要派給 Codex 時暫停,說要休息,**還沒有任何 task 被執行**,計畫文件跟規格都已經定案不用重新討論。

## 溝通注意事項

- **一律用繁體中文回覆**,包括工具/框架帶出來的英文樣板文字也要翻譯
- 使用者對這類外部平台(Supabase、Google Cloud)介面操作不熟悉,引導時**一次只給一小段具體指示**(哪個按鈕、哪個欄位填什麼),等使用者回報結果再給下一步,不要一次丟一大串步驟
- 涉及金鑰、密碼等機密資訊,**只引導使用者自己複製貼上,不要主動索取或要求對方貼給你看**
- 帳號註冊、金流設定這類事情**無法代辦**,只能引導使用者自己操作
