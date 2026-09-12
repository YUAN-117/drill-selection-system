# 攻牙底孔查詢 — 設計規格

## 背景與目的

使用者攻牙(用絲攻在孔裡切出內螺紋)前,需要先鑽一個直徑適當的「底孔」——太小絲攻會斷、太大牙深不夠強度不足。這個底孔直徑是業界標準表可以直接查到的固定值,跟鑽頭選擇系統既有的 Vc/進給量計算(屬於「經驗常用範圍」)性質不同,是查表型功能,不是計算型功能。

這次要在鑽頭選擇系統裡加一個獨立的「攻牙底孔查詢」區塊,讓使用者輸入想攻的螺紋規格,直接查出建議底孔直徑,跟現有的鑽頭 Vc/RPM/進給量計算機並存於同一頁面,但邏輯上完全獨立。

## 範圍

**這次要做的:**
- 新增 `assets/core/tapDrill.js`:純函式模組,內含公制(粗牙/細牙)、英制 UNC/UNF 的標準攻牙底孔對照表跟查詢函式
- 新增 `assets/ui/tapDrillView.js`:純渲染函式,產生規格選單 HTML 跟結果顯示
- 新增 `assets/ui/tapDrillController.js`:DOM 操作,串接畫面互動,獨立於現有 `toolController.js`
- `tool.html` 新增「攻牙底孔查詢」區塊,放在現有計算機下方
- 簡化選擇流程(見下方「簡化流程設計」),讓不熟悉「粗牙/細牙」術語的使用者也能直接查到對的答案

**明確不做(這次範圍外):**
- **不因材料調整底孔直徑**——統一查標準表,不像 Vc 那樣依材料有不同建議值(使用者已確認這樣就夠用)
- **不整合進歷史紀錄**——純查詢功能,查完即完成,不留存記錄,也不影響既有歷史紀錄的資料格式
- **不支援材料調整/公差等級選擇**——只給標準 75% 牙深嚙合的常用建議值,不做「依螺紋公差等級微調」這種更進階的功能
- **不支援非公制/英制以外的螺紋系統**(例如英制惠氏 BSW、管螺紋 NPT 等)——只做公制 ISO 跟美制 UNC/UNF
- **規格範圍限定常用小中型**:公制 M2–M24,英制 #4-40 到 1"-8(涵蓋絕大多數一般機械加工情境;比這更小或更大的特殊規格不在範圍內)

## 簡化流程設計

**核心問題**:不是每個使用者都知道「粗牙」跟「細牙」的差異,原始設計要求使用者先選螺紋標準(粗牙/細牙分開選)才能選規格,這對不熟術語的使用者是個障礙。

**解法**:把「粗牙/UNC」設為每個規格的預設值,細牙/UNF 變成選用的進階選項,不強迫使用者一開始就得懂術語:

1. 第一層選單「系統」:公制 / 英制(這個大家都知道自己的螺絲是哪一種,沒有理解門檻)
2. 第二層選單「規格」:直接列出公稱直徑(公制:M2、M3、M4...M24;英制:#4、#6、#8、#10、1/4"、5/16"...1"),**每個規格預設對應粗牙(公制)或 UNC(英制)**,不需要使用者先選標準
3. 結果清楚標示系統幫他選了什麼(例如「M6(粗牙,螺距 1.0mm)→ 建議底孔 5.0mm」),讓使用者知道發生了什麼事,但不用自己判斷
4. 結果下方有一個不起眼的核取方塊/連結「這顆是細牙?」,勾選後才出現細牙(公制)/UNF(英制)的螺距選項——因為同一個公稱直徑的細牙可能有不只一種螺距,需要再選一次;這個選項只給「已經知道自己要細牙」的進階使用者用,不會干擾一般查詢流程

## 資料模型

```js
// assets/core/tapDrill.js 的資料結構示意(非最終程式碼與數字,見下方「資料來源與可信度」)

export const TAP_DRILL_SYSTEMS = ['metric', 'imperial'];

// 公制:每個公稱直徑對應一個粗牙螺距(預設)+ 可能多個細牙螺距選項
export const METRIC_THREADS = {
  M2:  { coarse: { pitch: 0.4,  drillDiameter: 1.6 },  fine: [] },
  M3:  { coarse: { pitch: 0.5,  drillDiameter: 2.5 },  fine: [] },
  M4:  { coarse: { pitch: 0.7,  drillDiameter: 3.3 },  fine: [] },
  M5:  { coarse: { pitch: 0.8,  drillDiameter: 4.2 },  fine: [] },
  M6:  { coarse: { pitch: 1.0,  drillDiameter: 5.0 },  fine: [ { pitch: 0.75, drillDiameter: 5.2 } ] },
  M8:  { coarse: { pitch: 1.25, drillDiameter: 6.8 },  fine: [ { pitch: 1.0,  drillDiameter: 7.0 } ] },
  M10: { coarse: { pitch: 1.5,  drillDiameter: 8.5 },  fine: [ { pitch: 1.25, drillDiameter: 8.7 }, { pitch: 1.0, drillDiameter: 9.0 } ] },
  // ... M12 到 M24 依此類推
};

// 英制:每個規格對應一個 UNC 螺距(預設,用每吋牙數 TPI 表示)+ 可能的 UNF 選項
export const IMPERIAL_THREADS = {
  '#4':  { coarse: { tpi: 40, drillDiameter: 0.089 /* inch，畫面顯示會轉換或用分數表示 */ }, fine: [] },
  '1/4': { coarse: { tpi: 20, drillDiameter: 0.201 }, fine: [ { tpi: 28, drillDiameter: 0.213 } ] },
  // ... 依此類推
};

export function getTapDrillSize(system, nominalSize, { fine = false, pitchOrTpi } = {}) {
  // 回傳 { drillDiameter, pitch/tpi, isFine, nearestStandardDrill }
  // nearestStandardDrill：套用既有 assets/core/diameter.js 的 nearestStandardDiameter，
  // 讓查出來的底孔直徑跟現有「市售標準鑽頭尺寸」的邏輯一致（複用既有函式，不重造）
}
```

**設計重點：**
- `coarse` 永遠存在且是預設值;`fine` 是陣列(可能為空、一個、或多個選項),對應「細牙可能有多種螺距」的實際情況
- `getTapDrillSize` 回傳的底孔直徑會再套一次既有的 `nearestStandardDiameter`(來自 `assets/core/diameter.js`),因為查表算出來的理論底孔直徑不一定剛好是市售鑽頭尺寸,這裡直接複用既有邏輯對應到最接近的市售規格,不重複造輪子
- 英制的 `drillDiameter` 用英寸(inch)小數表示,畫面顯示時需要換算成公厘(因為這個工具的鑽頭直徑系統全部是公制),換算後一樣套用 `nearestStandardDiameter`

## 資料來源與可信度

**這裡的數字必須是精確值,不是「經驗常用範圍」**——跟 Vc/進給量那種允許模糊的資料性質不同,底孔查錯可能直接斷絲攻或牙深不足,不能憑印象填。上面資料模型裡列的數字只是示意格式,**實作計畫階段的第一個 task 必須包含「用可靠來源(例如 ISO 965-1 公制螺紋標準、ANSI/ASME B1.1 美制螺紋標準,或機械設計手冊的攻牙底孔對照表)查證每一筆數字」這個步驟,查完才能寫進最終程式碼**,不能未經查證就把這份規格文件裡的示意數字直接當正式資料使用。

底孔直徑的計算基礎是業界慣例「75% 牙深嚙合」(drill diameter ≈ major diameter − pitch,實際標準表會有些微修正),這個原則本身是公開穩定的業界共識,不需要另外驗證,但每一個規格的實際數字仍要對照可靠來源逐一確認。

## 畫面設計

新區塊「攻牙底孔查詢」,外觀比照現有計算機的卡片風格(深色結果區塊、一致的字體/間距),放在現有 Vc/RPM/進給量計算機下方,兩者視覺上分隔清楚但風格一致:

```html
<div class="panel" aria-label="攻牙底孔查詢">
  <h2>攻牙底孔查詢</h2>
  <div class="field-grid">
    <div class="field">
      <label for="tapSystem">系統</label>
      <select id="tapSystem">
        <option value="metric">公制</option>
        <option value="imperial">英制</option>
      </select>
    </div>
    <div class="field">
      <label for="tapSize">規格</label>
      <select id="tapSize"></select>
    </div>
  </div>
  <label class="tap-fine-toggle">
    <input type="checkbox" id="tapFineToggle"> 這顆是細牙?
  </label>
  <div id="tapFineOptions" hidden>
    <!-- 勾選細牙後才顯示，列出該規格所有細牙螺距選項 -->
  </div>
  <div id="tapResult"><!-- 建議底孔直徑顯示區 --></div>
</div>
```

`#tapSize` 選單內容隨 `#tapSystem` 切換重新產生(公制顯示 M2...M24,英制顯示 #4...1")。`#tapFineOptions` 預設隱藏,勾選 `#tapFineToggle` 才顯示該規格的細牙/UNF 螺距選項(如果該規格沒有細牙資料,核取方塊直接disable)。

## 測試策略

延續既有慣例:
- `tapDrill.js`(純函式)用 Node 單元測試涵蓋:每個系統至少測幾組粗牙/細牙查詢、驗證回傳的底孔直徑會套用 `nearestStandardDiameter`、驗證沒有細牙選項的規格回傳空陣列
- `tapDrillView.js`(純渲染函式)用單元測試涵蓋:規格選單 HTML 正確、細牙選項區塊的顯示邏輯
- `tapDrillController.js`(DOM 操作)手動瀏覽器驗證,不寫自動化測試,跟現有 `toolController.js` 做法一致

## 未來可能擴充(明確不在這次範圍內)

- 依材料微調底孔直徑(硬材料 vs 軟材料的建議百分比不同)
- 查詢結果整合進歷史紀錄
- 更完整的規格範圍(更小/更大的螺紋、惠氏 BSW、管螺紋 NPT 等其他螺紋系統)
- 螺紋公差等級選擇(這次只給單一標準建議值)
