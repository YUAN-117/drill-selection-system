import { nearestStandardDiameter } from './diameter.js';

export const TAP_DRILL_SYSTEMS = ['metric', 'imperial'];

// 資料來源：ISO 262 / ISO 965 公制螺紋螺距與 75% 牙深嚙合攻牙底孔對照表，
// 查證時交叉比對 Wikipedia (ISO metric screw thread)、AmesWeb 公制攻牙計算機、
// get-it-made.co.uk（引用 ISO 724:2023）等多個獨立來源。
export const METRIC_THREADS = {
  'M2':   { coarse: { pitch: 0.4,  drillDiameter: 1.60 },  fine: null },
  'M2.5': { coarse: { pitch: 0.45, drillDiameter: 2.05 },  fine: null },
  'M3':   { coarse: { pitch: 0.5,  drillDiameter: 2.50 },  fine: null },
  'M4':   { coarse: { pitch: 0.7,  drillDiameter: 3.30 },  fine: null },
  'M5':   { coarse: { pitch: 0.8,  drillDiameter: 4.20 },  fine: null },
  'M6':   { coarse: { pitch: 1.0,  drillDiameter: 5.00 },  fine: { pitch: 0.75, drillDiameter: 5.25 } },
  'M8':   { coarse: { pitch: 1.25, drillDiameter: 6.80 },  fine: { pitch: 1.0,  drillDiameter: 7.00 } },
  'M10':  { coarse: { pitch: 1.5,  drillDiameter: 8.50 },  fine: { pitch: 1.25, drillDiameter: 8.80 } },
  'M12':  { coarse: { pitch: 1.75, drillDiameter: 10.20 }, fine: { pitch: 1.5,  drillDiameter: 10.50 } },
  'M14':  { coarse: { pitch: 2.0,  drillDiameter: 12.00 }, fine: { pitch: 1.5,  drillDiameter: 12.50 } },
  'M16':  { coarse: { pitch: 2.0,  drillDiameter: 14.00 }, fine: { pitch: 1.5,  drillDiameter: 14.50 } },
  'M18':  { coarse: { pitch: 2.5,  drillDiameter: 15.50 }, fine: { pitch: 1.5,  drillDiameter: 16.50 } },
  'M20':  { coarse: { pitch: 2.5,  drillDiameter: 17.50 }, fine: { pitch: 1.5,  drillDiameter: 18.50 } },
  'M22':  { coarse: { pitch: 2.5,  drillDiameter: 19.50 }, fine: { pitch: 1.5,  drillDiameter: 20.50 } },
  'M24':  { coarse: { pitch: 3.0,  drillDiameter: 21.00 }, fine: { pitch: 2.0,  drillDiameter: 22.00 } }
};

// 資料來源：ANSI/ASME B1.1 統一螺紋標準（UNC/UNF）攻牙底孔對照表，
// 查證時交叉比對 Wikipedia (Unified Thread Standard)、ETSU 機工課程對照表
// （內容與 Machinery's Handbook 標準表一致）等多個獨立來源。
// drillDiameter 已從英吋換算成公厘（原始英吋值 × 25.4）。
export const IMPERIAL_THREADS = {
  '#4':   { coarse: { tpi: 40, drillDiameter: 2.26 },  fine: { tpi: 48, drillDiameter: 2.37 } },
  '#6':   { coarse: { tpi: 32, drillDiameter: 2.71 },  fine: { tpi: 40, drillDiameter: 2.87 } },
  '#8':   { coarse: { tpi: 32, drillDiameter: 3.45 },  fine: { tpi: 36, drillDiameter: 3.45 } },
  '#10':  { coarse: { tpi: 24, drillDiameter: 3.80 },  fine: { tpi: 32, drillDiameter: 4.04 } },
  '#12':  { coarse: { tpi: 24, drillDiameter: 4.50 },  fine: { tpi: 28, drillDiameter: 4.62 } },
  '1/4':  { coarse: { tpi: 20, drillDiameter: 5.11 },  fine: { tpi: 28, drillDiameter: 5.41 } },
  '5/16': { coarse: { tpi: 18, drillDiameter: 6.53 },  fine: { tpi: 24, drillDiameter: 6.91 } },
  '3/8':  { coarse: { tpi: 16, drillDiameter: 7.94 },  fine: { tpi: 24, drillDiameter: 8.43 } },
  '7/16': { coarse: { tpi: 14, drillDiameter: 9.35 },  fine: { tpi: 20, drillDiameter: 9.92 } },
  '1/2':  { coarse: { tpi: 13, drillDiameter: 10.72 }, fine: { tpi: 20, drillDiameter: 11.51 } },
  '9/16': { coarse: { tpi: 12, drillDiameter: 12.30 }, fine: { tpi: 18, drillDiameter: 13.10 } },
  '5/8':  { coarse: { tpi: 11, drillDiameter: 13.49 }, fine: { tpi: 18, drillDiameter: 14.68 } },
  '3/4':  { coarse: { tpi: 10, drillDiameter: 16.67 }, fine: { tpi: 16, drillDiameter: 17.46 } },
  '7/8':  { coarse: { tpi: 9,  drillDiameter: 19.45 }, fine: { tpi: 14, drillDiameter: 20.64 } },
  '1':    { coarse: { tpi: 8,  drillDiameter: 22.23 }, fine: { tpi: 14, drillDiameter: 23.81 } }
};

// 明確宣告顯示順序，不依賴 Object.keys() 的列舉順序——JS 引擎會把「看起來像陣列
// 索引的純數字字串」鍵（例如 IMPERIAL_THREADS 裡的 '1'）自動排到所有字串鍵之前，
// 跟原始碼裡的宣告順序無關，所以順序必須另外用陣列明確維護。
const METRIC_SIZE_ORDER = [
  'M2', 'M2.5', 'M3', 'M4', 'M5', 'M6', 'M8', 'M10',
  'M12', 'M14', 'M16', 'M18', 'M20', 'M22', 'M24'
];

const IMPERIAL_SIZE_ORDER = [
  '#4', '#6', '#8', '#10', '#12', '1/4', '5/16', '3/8',
  '7/16', '1/2', '9/16', '5/8', '3/4', '7/8', '1'
];

function getTable(system) {
  if (system === 'metric') return METRIC_THREADS;
  if (system === 'imperial') return IMPERIAL_THREADS;
  throw new Error(`Unknown thread system: ${system}`);
}

function getSizeOrder(system) {
  if (system === 'metric') return METRIC_SIZE_ORDER;
  if (system === 'imperial') return IMPERIAL_SIZE_ORDER;
  throw new Error(`Unknown thread system: ${system}`);
}

function getEntry(system, nominalSize) {
  const table = getTable(system);
  const entry = table[nominalSize];
  if (!entry) throw new Error(`Unknown ${system} thread size: ${nominalSize}`);
  return entry;
}

export function getNominalSizes(system) {
  return [...getSizeOrder(system)];
}

export function hasFineOption(system, nominalSize) {
  return getEntry(system, nominalSize).fine !== null;
}

export function getTapDrillSize(system, nominalSize, { fine = false } = {}) {
  const entry = getEntry(system, nominalSize);
  const variant = fine ? entry.fine : entry.coarse;
  if (!variant) throw new Error(`${nominalSize} has no fine variant`);
  const exactDrillDiameter = variant.drillDiameter;
  return {
    system,
    nominalSize,
    isFine: fine,
    pitch: system === 'metric' ? variant.pitch : undefined,
    tpi: system === 'imperial' ? variant.tpi : undefined,
    exactDrillDiameter,
    standardDrillDiameter: nearestStandardDiameter(exactDrillDiameter)
  };
}
