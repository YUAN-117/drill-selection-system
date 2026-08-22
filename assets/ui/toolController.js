import { STANDARD_SIZES, nearestStandardDiameter } from '../core/diameter.js';
import { computeAllResults } from '../core/materials.js';
import { addHistoryRecord } from '../data/historyStore.js';
import {
  EMPTY_COMPARE_ROW,
  GUIDANCE_DEFAULT_TEXT,
  GUIDANCE_RESULT_HTML,
  renderCompareRows,
  renderDiameterHint
} from './toolView.js';

const diameterEl = document.getElementById('diameter');
const alloyEl = document.getElementById('alloy');
const compareBody = document.getElementById('compareBody');
const diaHint = document.getElementById('diaHint');
const guidanceLine = document.getElementById('guidanceLine');
const addBtn = document.getElementById('addBtn');

let currentComputation = null;

function renderEmpty() {
  compareBody.innerHTML = EMPTY_COMPARE_ROW;
  diaHint.innerHTML = '&nbsp;';
  guidanceLine.textContent = GUIDANCE_DEFAULT_TEXT;
  addBtn.disabled = true;
  currentComputation = null;
}

function renderResults(rawDiameter, alloyKey) {
  const { diameter, results } = computeAllResults(rawDiameter, alloyKey);
  diaHint.innerHTML = renderDiameterHint(rawDiameter, diameter);
  compareBody.innerHTML = renderCompareRows(results);
  guidanceLine.innerHTML = GUIDANCE_RESULT_HTML;
  addBtn.disabled = false;
  currentComputation = { diameter, alloy: alloyKey, results };
}

function recompute() {
  const raw = parseFloat(diameterEl.value);
  if (!raw || raw <= 0) {
    renderEmpty();
    return;
  }
  renderResults(raw, alloyEl.value);
}

diameterEl.addEventListener('input', recompute);
diameterEl.addEventListener('blur', () => {
  const raw = parseFloat(diameterEl.value);
  if (raw > 0) diameterEl.value = nearestStandardDiameter(raw);
});
alloyEl.addEventListener('change', recompute);

addBtn.addEventListener('click', () => {
  if (!currentComputation) return;
  addHistoryRecord(localStorage, currentComputation.diameter, currentComputation.alloy, currentComputation.results);
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

renderEmpty();
