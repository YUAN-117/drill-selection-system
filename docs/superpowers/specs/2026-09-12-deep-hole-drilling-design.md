# 深孔鑽提醒 — 設計規格

## 背景與目的

鑽孔深度超過鑽頭直徑一定倍數時(業界稱「深孔」),排屑會變困難,容易積屑、崩刃、孔壁刮傷,需要分段進給、適時退屑排屑。現有計算機完全不考慮孔深(`tool.html` 的既有說明文字甚至明講「目前不考慮孔深/深徑比」)。這次擴充:新增一個選填的「孔深」輸入欄位,當深徑比(孔深 ÷ 鑽頭直徑)達到門檻時,顯示警告文字提醒使用者。

**刻意不做的事**(對照 Vc/f 那類「經驗常用範圍」數字):這次**不**調整 Vc/RPM 的計算結果,**不**給具體的退屑次數/間隔建議——因為深孔加工的實際節奏受機台、材料、刀具、實際排屑狀況影響很大,給一個看似精確的「每 X 倍直徑退屑一次」通用公式反而是沒有可靠依據的臆測數字,違反這個專案一貫「不憑空捏造精確數字」的原則。這次只做「文字警告 + 提醒原則」,不做「精確退屑排程計算」。

## 範圍

**這次要做的:**
- `assets/core/materials.js` 新增純函式 `getDeepHoleWarning(depth, diameter)`,深徑比 ≥ 3 才觸發警告
- `computeResult` 簽名擴充成 `computeResult(rawDiameter, materialKey, subtypeKey, drillToolType, depth)`,`depth` 是選填的第五個參數,不傳就完全不判斷深孔,回傳物件的既有欄位(`vc`/`rpm`/`f`/`feedRate` 等)完全不受影響
- `tool.html` 的 `field-grid` 新增第四欄「孔深(mm,選填)」輸入框,結果區下方新增 `#deepHoleWarning` 區塊標記
- `assets/ui/toolView.js` 新增純渲染函式(依 `deepHoleWarning` 是否為 `null` 決定顯示/隱藏該區塊、填入文字),`assets/ui/toolController.js` 讀取 `#depth` 欄位值傳進 `computeResult`,並把回傳的 `deepHoleWarning` 接到畫面上
- `assets/data/historyStore.js` 的 `addHistoryRecord` 多存 `depth`/`deepHoleWarning` 兩個欄位
- `historyView.js` 顯示歷史紀錄時,有孔深資料的紀錄額外顯示孔深跟(如果有觸發)深孔警告

**明確不做(這次範圍外):**
- **不調整 Vc/RPM 建議值**——深孔只加文字提醒,不影響既有的轉速/進給量計算邏輯
- **不給具體退屑次數/間隔建議**——只給原則性文字提醒(分段進給、適時退屑、不可中途長時間停頓),不給看似精確但缺乏可靠依據的數字
- **不因材料/鑽頭材質調整深孔門檻**——深徑比 3 倍是統一門檻,不分材料軟硬
- **孔深欄位選填,不強制**——沒填就完全不判斷深孔,計算結果正常顯示,不影響任何既有使用流程
- **既有(這次上線前)的歷史紀錄不做資料轉換**——舊紀錄沒有 `depth` 欄位,顯示時視為「沒有孔深資料」,不噴錯、不顯示孔深那段,不特別寫遷移邏輯(延續多材料擴充計畫當時的決定)

## 核心邏輯

```js
// assets/core/materials.js 新增

export function getDeepHoleWarning(depth, diameter) {
  if (depth == null) return null;
  const ratio = depth / diameter;
  if (ratio < 3) return null;
  return `⚠ 深孔(深徑比約 ${ratio.toFixed(1)} 倍),建議分段進給並適時退屑排屑,避免鑽頭崩刃或孔壁刮傷;鑽孔中途不可長時間停頓進給。`;
}
```

`computeResult` 內部先算出既有的 `diameter`(套用 `nearestStandardDiameter` 後的最終鑽頭直徑),再用這個最終直徑(不是使用者輸入的原始直徑)去算深徑比,跟其他計算欄位的基準一致。`depth` 本身不套用任何標準化,直接使用者輸入多少就是多少。

回傳物件新增兩個欄位:
- `depth`:使用者輸入的孔深,沒填是 `null`
- `deepHoleWarning`:`getDeepHoleWarning` 的回傳值,沒觸發或沒填孔深都是 `null`

**設計重點**:`depth` 參數是選填(`undefined` 時視同沒填,等同 `null`),所以任何既有呼叫 `computeResult` 的地方(包括所有既有測試)完全不用改,原本的呼叫方式行為不變。

## 畫面設計

### 孔深輸入欄(新增)

在 `field-grid` 裡,現有「鑽頭直徑」「材料材質」「鑽頭材質」三欄後面新增第四欄:

```html
<div class="field">
  <label for="depth">孔深 (mm,選填)</label>
  <input type="number" id="depth" min="0" step="0.5" placeholder="不填則不判斷深孔">
</div>
```

### 深孔警告區塊(新增)

在既有 `#guidanceLine`(材料 caveat 提醒文字)下方新增:

```html
<div class="params-line" id="guidanceLine">選擇材質並輸入直徑後,顯示選用原則</div>
<div class="params-line deep-hole-warning" id="deepHoleWarning" hidden></div>
```

`#deepHoleWarning` 預設 `hidden`,只有 `computeResult` 回傳的 `deepHoleWarning` 不是 `null` 時才移除 `hidden` 屬性並填入文字。樣式沿用既有的警示色(`--danger`),跟一般提醒文字(`--text-muted`)區隔開,讓使用者一眼看出這是「要注意」而不是「一般說明」。

### 頁尾說明文字更新

既有的「目前不考慮孔深/深徑比、貫穿孔或沉頭孔」這句要拿掉「孔深/深徑比」,改成只保留「貫穿孔或沉頭孔」(因為這兩個真的還沒做),避免文字跟新功能矛盾。

## 對歷史紀錄的影響

`historyStore.js` 的 `addHistoryRecord` 簽名:

- 舊格式:`addHistoryRecord(storage, diameter, materialKey, subtypeKey, drillToolType, result)`
- 新格式:`addHistoryRecord(storage, diameter, materialKey, subtypeKey, drillToolType, result, depth)`,`depth` 選填(對應呼叫端 `#depth` 欄位的值,沒填傳 `undefined`/`null`)

儲存的紀錄物件新增 `depth`(沒填是 `null`)跟 `deepHoleWarning`(來自 `result.deepHoleWarning`,沒觸發是 `null`)兩個欄位。

`historyView.js` 的 `renderHistoryRecord`:
- 有 `depth` 資料的紀錄,標題從「8mm · 6061」改成「8mm(孔深 30mm)· 6061」
- 沒有 `depth` 的紀錄(包含這次上線前存的舊格式紀錄)維持原本標題格式,不顯示孔深
- 有 `deepHoleWarning` 的紀錄,在該筆紀錄底下額外顯示這段警告文字(樣式呼應畫面上的深孔警告區塊)

## 測試策略

延續既有原則:
- `getDeepHoleWarning`:測試門檻邊界(深徑比剛好 3 倍要觸發、2.9 倍不觸發、明顯超過的案例)、`depth` 為 `null`/`undefined` 時回傳 `null`
- `computeResult`:測試傳入 `depth` 時正確帶出 `deepHoleWarning`,不傳 `depth` 時行為完全跟現有既有測試一致(向下相容)
- `toolView.js`/`historyView.js` 的新渲染邏輯(深孔警告區塊顯示/隱藏、孔深標題文字)用單元測試涵蓋
- `toolController.js`/`historyStore.js` 手動瀏覽器驗證,不寫自動化測試

## 未來可能擴充(明確不在這次範圍內)

- 依材料/鑽頭材質調整深孔門檻或給更細緻的退屑建議
- 深孔對 Vc/RPM 的實際影響(需要更可靠的數據來源才做)
- 具體的啄鑽退屑排程建議(次數、間隔)
