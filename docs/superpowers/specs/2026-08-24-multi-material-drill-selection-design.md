# 多材料鑽頭選擇擴充 — 設計規格

## 背景與目的

現有的鑽頭選擇系統只支援「鋁合金」一種工件材料,鑽頭材質(HSS/硬質合金/塗層硬質合金)三種計算結果並排比較顯示。這次擴充:

1. **工件材料**從「只有鋁合金」擴充成「鋁合金、銅合金、不鏽鋼、PEEK、PC、POM」六大類。
2. **鑽頭材質**從「自動算出三種並排比較」改成「使用者自己選一種鑽頭材質」,畫面只顯示該選擇的單一計算結果,選單本身在選項文字上標註建議 Vc 範圍(例如「高速鋼 HSS(建議 30–60 m/min)」),方便使用者判斷該選哪個。

這兩項改動互相影響:鑽頭材質選單的建議範圍**必須隨工件材料即時變動**(不鏽鋼的 HSS 建議範圍跟鋁合金完全不同量級),所以底層計算邏輯不能再用「鑽頭材質固定範圍 + 材料偏好值內插」的舊模型,要改成「每種工件材料自己一組完整的鑽頭材質 Vc 範圍」。

## 範圍

**這次要做的:**
- `assets/core/materials.js` 資料結構重新設計(見下方「資料模型」),舊的 `ALLOY_BIAS`/`ALLOY_LABELS`/共用 `DRILL_MATERIALS` Vc 範圍模型整個替換掉
- 識別字/命名從「alloy」改成「material」(`alloyEl` → `materialEl`、`ALLOY_LABELS` → `MATERIAL_LABELS` 等)——因為擴充後不再全部是「合金」,繼續叫 alloy 會誤導
- `tool.html` 材料材質選單改用 `<optgroup>` 分組(鋁合金底下 4 個子項,其他大類各自 1 個隱含子項,不另外顯示子選單)
- `tool.html` 新增「鑽頭材質」選單(3 個選項),選項文字標註建議 Vc 範圍,隨工件材料變動即時更新
- 比較表從「三欄並排」改成「單一結果」(仍保留採用 Vc / RPM / 進給量 / 進給速度的呈現方式,只是不再三種材質並排)
- `assets/data/historyStore.js` 紀錄格式配合改成存單一結果 + 選用的鑽頭材質(而不是 `results` 陣列存三種)
- `assets/ui/historyView.js` / `history.html` 配合新的紀錄格式調整顯示
- Supabase Edge Function(`supabase/functions/parse-drill-voice/`)的 `promptBuilder.js`/`parseAiResponse.js` 擴充允許辨識的工件材料清單(6 大類共 9 種「大類:子項」組合,扣掉不給 AI 猜的 `aluminum:custom`,共 8 個 key)
- 所有既有測試配合新資料結構改寫,新增的計算邏輯要有對應測試

**明確不做(這次範圍外,以後有需要再擴充):**
- 青銅、鐵氟龍(PTFE)——研究資料信心度不足,先不加
- 銅合金/不鏽鋼細分多個子項(例如 304 vs 316、黃銅 vs 青銅)——先各自只有一個通用值,之後有更準確數據再拆
- AI 語音輸入辨識「鑽頭材質」——語音這次只擴充「工件材料」的辨識範圍,鑽頭材質維持使用者手動選,語音講完材質/直徑後鑽頭材質欄位維持原值不變
- 既有歷史紀錄的資料格式轉換——舊格式(`results` 陣列存三種材質)的紀錄在新版上線後可能顯示異常,不特別寫轉換邏輯,使用者可自行清除歷史紀錄(這是單人使用的個人工具,localStorage 資料量小,不值得為此增加轉換邏輯的複雜度)

## 資料模型

### 新的核心資料結構(取代舊的 `DRILL_MATERIALS`/`ALLOY_BIAS`/`ALLOY_LABELS`)

```js
// assets/core/materials.js 的新資料結構示意(非最終程式碼,實作計畫階段會定案確切格式)

export const DRILL_TOOL_TYPES = ['hss', 'carbide', 'coated']; // 鑽頭材質三選項,順序固定

export const WORKPIECE_MATERIALS = {
  aluminum: {
    label: '鋁合金',
    subtypes: {
      '6061': { label: '6061', bias: 0.7 },
      '7075': { label: '7075', bias: 0.5 },
      a380:   { label: 'A380 壓鑄鋁', bias: 0.35 },
      custom: { label: '自訂鋁合金', bias: 0.5 }
    },
    drillVc: {
      hss:     { min: 30,  max: 60  },
      carbide: { min: 150, max: 300 },
      coated:  { min: 200, max: 350 }
    },
    feedBands: [ /* 既有 6 段,依直徑 dmax 分段,不變 */ ]
  },
  copper: {
    label: '銅合金',
    subtypes: { brass: { label: '黃銅', bias: 0.5 } },
    drillVc: {
      hss:     { min: 50, max: 80  },
      carbide: { min: 60, max: 200 },
      coated:  { min: 80, max: 250, lowConfidence: true } // 來源用比例推估,非直接數據
    },
    feedBands: [ { dmax: Infinity, fmin: 0.10, fmax: 0.25, def: 0.175 } ] // 單一段,不隨直徑變化(來源資料沒有分段)
  },
  stainless: {
    label: '不鏽鋼',
    subtypes: { standard: { label: '不鏽鋼(304/316 通用)', bias: 0.5 } },
    drillVc: {
      hss:     { min: 8,  max: 15 },
      carbide: { min: 30, max: 50 },
      coated:  { min: 40, max: 70, lowConfidence: true }
    },
    feedBands: [
      { dmax: 6,        fmin: 0.10, fmax: 0.15, def: 0.125 },
      { dmax: 15,       fmin: 0.15, fmax: 0.22, def: 0.185 },
      { dmax: Infinity, fmin: 0.20, fmax: 0.30, def: 0.25  }
    ],
    caveat: '進給量不可過低,過低會使表面加工硬化,可能咬死鑽頭;不可中途暫停進給。'
  },
  peek: {
    label: 'PEEK',
    subtypes: { standard: { label: 'PEEK(通用)', bias: 0.5 } },
    drillVc: {
      hss:     { min: 30, max: 120 },
      carbide: { min: 30, max: 120 },
      coated:  { min: 30, max: 120 }
    },
    feedBands: [ { dmax: Infinity, fmin: 0.08, fmax: 0.20, def: 0.14 } ],
    caveat: '工程塑膠主要受熱影響(易因悶熱軟化/積屑),鑽頭材質對速度影響較小;深孔建議降低轉速並分段退屑。'
  },
  pc: {
    label: 'PC 聚碳酸酯',
    subtypes: { standard: { label: 'PC(通用)', bias: 0.5 } },
    drillVc: {
      hss:     { min: 15, max: 30 },
      carbide: { min: 15, max: 30 },
      coated:  { min: 15, max: 30 }
    },
    feedBands: [
      { dmax: 6,        fmin: 0.18, fmax: 0.38, def: 0.28 },
      { dmax: 15,       fmin: 0.38, fmax: 0.64, def: 0.51 },
      { dmax: Infinity, fmin: 0.51, fmax: 1.27, def: 0.89 }
    ],
    caveat: '工程塑膠主要受熱影響,鑽頭材質對速度影響較小;易因悶熱產生應力裂紋,鑽頭需保持銳利,接近穿透時建議減速。'
  },
  pom: {
    label: 'POM / Delrin',
    subtypes: { standard: { label: 'POM(通用)', bias: 0.5 } },
    drillVc: {
      hss:     { min: 60, max: 100 },
      carbide: { min: 60, max: 100 },
      coated:  { min: 60, max: 100 }
    },
    feedBands: [ { dmax: Infinity, fmin: 0.10, fmax: 0.20, def: 0.15 } ],
    caveat: '工程塑膠主要受熱影響,鑽頭材質對速度影響較小;穿透時建議維持進給速度(不要放慢),避免鑽頭咬料造成孔口撕裂。'
  }
};
```

**設計重點:**
- 每個工件材料大類自帶完整的 `drillVc`(三種鑽頭材質各自的 Vc 範圍)跟 `feedBands`,不再共用同一組鑽頭材質範圍去內插——這是這次架構調整的核心。
- `subtypes` 統一結構(即使只有一個子項,例如不鏽鋼的 `standard`),讓「材料材質」下拉選單的 `<optgroup>` 渲染邏輯可以一致處理所有大類,不用為「有沒有子項」寫特殊分支。
- `bias`(0~1)沿用既有鋁合金的內插設計:`vc = min + bias * (max - min)`。只有一個子項的大類,`bias` 固定 0.5(取範圍中點)。
- `feedBands` 統一用既有 `{ dmax, fmin, fmax, def }` 陣列格式,即使某些材料只有「一段涵蓋所有直徑」(`dmax: Infinity`)——這樣 `getFeedBand(diameter, material)` 的邏輯對所有材料都一致,不用分「有沒有分段」的特殊情況。
- `lowConfidence: true` 標記資料信心度較低的欄位(銅合金/不鏽鋼的塗層硬質合金 Vc,是用比例推估、非直接查到的數據),畫面上這類數值旁邊會加一個小提示(例如 ⓘ 圖示或文字註記「推估值」)。
- `caveat` 是該材料的重要提醒文字,顯示在結果下方(取代舊版固定的「一般用途或單件加工可選 HSS...」那段文字,改成依材料動態顯示)。

### 資料來源與可信度

以上數值整理自公開的刀具廠商速度/進給參考表與塑膠材料加工指南(非實測驗證),沿用這個專案一貫的原則——**這些是經驗常用範圍,不是精確固定值**。銅合金塗層硬質合金、不鏽鋼塗層硬質合金兩個數值是用「硬質合金數值 + 20~50% 提升」的經驗法則推估,標記 `lowConfidence`。另外,不鏽鋼的三段進給量分段(依直徑 6mm/15mm 分段)是根據來源給的「進給下限 0.10mm/rev」加上單一組範例數字(11mm 鑽頭約 0.20–0.30mm/rev)內插補出來的分段曲線,**不是來源直接給的分段表**,精確度比鋁合金/PC 的分段(有明確的逐段來源數據)低一些,但仍在合理範圍內。使用者之後若有更準確的實測或廠商數據,可以直接覆蓋這些數字。

## 計算邏輯變化

- `computeVc(workpieceMaterialKey, subtypeKey, drillToolType)`:改成先查 `WORKPIECE_MATERIALS[workpieceMaterialKey].drillVc[drillToolType]` 拿到 `{min, max}`,再用該材料 `subtypes[subtypeKey].bias` 內插——公式不變,只是範圍來源從「全域共用」變成「材料自帶」。
- `getFeedBand(diameter, workpieceMaterialKey)`:改成查 `WORKPIECE_MATERIALS[workpieceMaterialKey].feedBands`,邏輯(找第一個 `diameter <= dmax` 的分段)不變。
- `computeResult(diameter, workpieceMaterialKey, subtypeKey, drillToolType)`:取代舊的 `computeAllResults`,回傳單一結果物件(不再回傳三個材質的陣列),欄位跟現有 `computeResultForMaterial` 回傳的形狀相同(`vc`、`f`、`rpm`、`feedRate`),外加 `caveat` 文字跟 `lowConfidence` 標記(如果採用的 Vc 落在 `lowConfidence` 欄位)。

## 畫面設計

### 材料材質選單(取代舊的 `#alloy`)

```html
<select id="material">
  <optgroup label="鋁合金">
    <option value="aluminum:6061">6061</option>
    <option value="aluminum:7075">7075</option>
    <option value="aluminum:a380">A380 壓鑄鋁</option>
    <option value="aluminum:custom">自訂鋁合金</option>
  </optgroup>
  <optgroup label="銅合金">
    <option value="copper:brass">黃銅</option>
  </optgroup>
  <option value="stainless:standard">不鏽鋼</option>
  <option value="peek:standard">PEEK</option>
  <option value="pc:standard">PC 聚碳酸酯</option>
  <option value="pom:standard">POM / Delrin</option>
</select>
```

`value` 用 `類別:子項` 的組合字串(例如 `aluminum:6061`、`stainless:standard`),前端讀到後 `split(':')` 拆成 `workpieceMaterialKey` 跟 `subtypeKey` 兩個值,傳進 `computeResult`。只有一個子項的大類不包在 `<optgroup>` 裡,直接是頂層 `<option>`(視覺上跟鋁合金底下的子項有區隔,但不會多一層看起來像「大類底下只有自己」的贅餘結構)。

### 鑽頭材質選單(新增)

```html
<select id="drillMat">
  <option value="hss">高速鋼 HSS(建議 30–60 m/min)</option>
  <option value="carbide">硬質合金(建議 150–300 m/min)</option>
  <option value="coated">塗層硬質合金(建議 200–350 m/min)</option>
</select>
```

選項文字(括號內的建議範圍)是 JS 動態產生,每次 `#material` 改變時,用新選到的工件材料的 `drillVc` 重新產生這三個 `<option>` 的文字並寫回選單,同時保留使用者原本選的 `value`(不因為文字更新而重置選擇)。

### 結果顯示區

從「三欄比較表」改成「單欄結果」,呈現的欄位不變(Vc/RPM/進給量/進給速度),額外顯示該材料的 `caveat` 提醒文字(取代舊版固定的鋁合金專用建議文字)。如果採用的 Vc 落在 `lowConfidence` 範圍,額外顯示一個小提示(例如「⚠ 此數值為推估參考,信心度較低」)。

## 對歷史紀錄的影響

`historyStore.js` 的 `addHistoryRecord` 簽名跟儲存格式改變:

- 舊格式:`addHistoryRecord(storage, diameter, alloyKey, results)`,`results` 是三種鑽頭材質的陣列
- 新格式:`addHistoryRecord(storage, diameter, workpieceMaterialKey, subtypeKey, drillToolType, result)`,`result` 是單一結果物件

`historyView.js` 的渲染邏輯配合改成顯示「單一材料 + 單一鑽頭材質 + 單一結果」,不再是每筆紀錄底下一個三行小表格。

**既有(舊格式)的歷史紀錄不做轉換**,上線後如果 `localStorage` 裡還有舊格式資料,`historyView.js` 讀到形狀不符的紀錄時,以不噴錯、顯示空白或略過該筆為底線(實作計畫階段會定義具體的防呆行為),不特別寫遷移邏輯。

## AI 語音輸入的擴充範圍

`promptBuilder.js` 的 `ALLOWED_ALLOY_KEYS`(未來改名 `ALLOWED_MATERIAL_KEYS`)從 3 個擴充成對應 `WORKPIECE_MATERIALS` 裡所有「大類:子項」組合(共 8 個:`aluminum:6061`、`aluminum:7075`、`aluminum:a380`、`copper:brass`、`stainless:standard`、`peek:standard`、`pc:standard`、`pom:standard`,**不含** `aluminum:custom`,原因同既有設計——AI 沒辦法幫使用者猜「自訂」該填什麼參數)。

`parseAiResponse.js` 的驗證邏輯同步更新允許清單。System prompt 裡列出的材質說明文字也要跟著更新(讓 AI 知道使用者說「不鏽鋼」「PC」時該對應到哪個 key)。

**語音輸入不解析鑽頭材質**——語音填完直徑跟工件材料後,`#drillMat` 維持原本的值不變(使用者上次選的,或頁面預設值),不會被語音結果覆蓋。

**欄位命名與回傳格式**:`alloy` 這個欄位名稱要在整條資料流一致改成 `material`,不能只改前端、後端還留著舊名——具體包含:
- `promptBuilder.js` 裡 `record_drill_voice_input` 工具 schema 的 `alloy` 屬性改名 `material`(值域是上面列的 9 個「大類:子項」組合字串,例如 `"stainless:standard"`,取代原本的裸鍵值如 `"6061"`)
- `parseAiResponse.js` 的 `parseVoiceToolInput` 回傳物件的 `alloy` 欄位改成 `material`
- `index.ts` 回應給前端的 JSON 裡 `alloy` 欄位改成 `material`
- 前端 `voiceParseClient.js`、`voiceInputController.js`、`voiceInputView.js` 裡所有 `alloy` 相關的變數/參數名稱也一併改成 `material`

改完後前端拿到 `result.material` 可以直接設定 `#material.value = result.material`,不需要額外轉換或拼接字串。

## 測試策略

延續專案既有原則:
- `core/materials.js` 的新資料結構跟計算函式(`computeVc`、`getFeedBand`、`computeResult`)用 Node 單元測試涵蓋,針對每個工件材料至少各測一組數值(驗證範圍內插、進給量分段正確)
- `historyStore.js` 的新簽名/格式配合改寫既有測試
- `ui/*View.js`(純渲染函式)的新輸出(optgroup 選單 HTML、動態鑽頭材質選項文字、單一結果渲染、caveat 文字)用單元測試涵蓋
- `ui/*Controller.js`(DOM 操作)一樣手動瀏覽器驗證,不寫自動化測試
- 後端 `promptBuilder.js`/`parseAiResponse.js` 的允許清單擴充,延續既有的 Node 單元測試模式

## 未來可能擴充(明確不在這次範圍內)

- 青銅、鐵氟龍(PTFE)——待更可靠的數據來源
- 不鏽鋼細分 304/316/其他等級
- 銅合金細分青銅等其他子項
- AI 語音輸入辨識鑽頭材質
- 既有(舊格式)歷史紀錄的資料轉換
