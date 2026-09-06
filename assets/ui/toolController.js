import { STANDARD_SIZES, nearestStandardDiameter } from '../core/diameter.js';
import { computeResult, DRILL_TOOL_TYPES } from '../core/materials.js';
import { addHistoryRecord } from '../data/historyStore.js';
import {
  EMPTY_RESULT_ROW,
  GUIDANCE_DEFAULT_TEXT,
  renderMaterialOptionsHtml,
  renderDrillMatOptionsHtml,
  renderResultRow,
  renderGuidanceHtml,
  renderDiameterHint
} from './toolView.js';

const diameterEl = document.getElementById('diameter');
const materialEl = document.getElementById('material');
const drillMatEl = document.getElementById('drillMat');
const compareBody = document.getElementById('compareBody');
const diaHint = document.getElementById('diaHint');
const guidanceLine = document.getElementById('guidanceLine');
const addBtn = document.getElementById('addBtn');

let currentComputation = null;

function parseMaterialValue(value) {
  const [materialKey, subtypeKey] = value.split(':');
  return { materialKey, subtypeKey };
}

function renderEmpty() {
  compareBody.innerHTML = EMPTY_RESULT_ROW;
  diaHint.innerHTML = '&nbsp;';
  guidanceLine.textContent = GUIDANCE_DEFAULT_TEXT;
  addBtn.disabled = true;
  currentComputation = null;
}

function refreshDrillMatOptions(materialKey) {
  const previousValue = drillMatEl.value;
  drillMatEl.innerHTML = renderDrillMatOptionsHtml(materialKey);
  if (DRILL_TOOL_TYPES.includes(previousValue)) {
    drillMatEl.value = previousValue;
  }
}

function renderResults(rawDiameter, materialKey, subtypeKey, drillToolType) {
  const result = computeResult(rawDiameter, materialKey, subtypeKey, drillToolType);
  diaHint.innerHTML = renderDiameterHint(rawDiameter, result.diameter);
  compareBody.innerHTML = renderResultRow(result, materialKey);
  guidanceLine.innerHTML = renderGuidanceHtml(materialKey);
  addBtn.disabled = false;
  currentComputation = { diameter: result.diameter, materialKey, subtypeKey, drillToolType, result };
}

function recompute() {
  const raw = parseFloat(diameterEl.value);
  if (!raw || raw <= 0) {
    renderEmpty();
    return;
  }
  const { materialKey, subtypeKey } = parseMaterialValue(materialEl.value);
  renderResults(raw, materialKey, subtypeKey, drillMatEl.value);
}

diameterEl.addEventListener('input', recompute);
diameterEl.addEventListener('blur', () => {
  const raw = parseFloat(diameterEl.value);
  if (raw > 0) diameterEl.value = nearestStandardDiameter(raw);
});
materialEl.addEventListener('change', () => {
  const { materialKey } = parseMaterialValue(materialEl.value);
  refreshDrillMatOptions(materialKey);
  recompute();
});
drillMatEl.addEventListener('change', recompute);

addBtn.addEventListener('click', () => {
  if (!currentComputation) return;
  const { diameter, materialKey, subtypeKey, drillToolType, result } = currentComputation;
  addHistoryRecord(localStorage, diameter, materialKey, subtypeKey, drillToolType, result);
  addBtn.textContent = '已加入 ✓';
  setTimeout(() => {
    addBtn.textContent = '加入記錄';
  }, 1200);
});

(function populateDatalist() {
  const list = document.getElementById('drillSizeList');
  const frag = document.createDocumentFragment();
  STANDARD_SIZES.forEach((size) => {
    const opt = document.createElement('option');
    opt.value = size;
    frag.appendChild(opt);
  });
  list.appendChild(frag);
})();

materialEl.innerHTML = renderMaterialOptionsHtml();
refreshDrillMatOptions(parseMaterialValue(materialEl.value).materialKey);
renderEmpty();
