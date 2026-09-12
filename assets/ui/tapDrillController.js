import { hasFineOption, getTapDrillSize } from '../core/tapDrill.js';
import { renderSizeOptionsHtml, renderTapResultHtml } from './tapDrillView.js';

const tapSystemEl = document.getElementById('tapSystem');
const tapSizeEl = document.getElementById('tapSize');
const tapFineToggleEl = document.getElementById('tapFineToggle');
const tapResultEl = document.getElementById('tapResult');

function refreshFineToggleAvailability() {
  const canBeFine = hasFineOption(tapSystemEl.value, tapSizeEl.value);
  tapFineToggleEl.disabled = !canBeFine;
  if (!canBeFine) tapFineToggleEl.checked = false;
}

function recompute() {
  refreshFineToggleAvailability();
  const result = getTapDrillSize(tapSystemEl.value, tapSizeEl.value, { fine: tapFineToggleEl.checked });
  tapResultEl.innerHTML = renderTapResultHtml(result);
}

function refreshSizeOptions() {
  tapSizeEl.innerHTML = renderSizeOptionsHtml(tapSystemEl.value);
}

tapSystemEl.addEventListener('change', () => {
  refreshSizeOptions();
  tapFineToggleEl.checked = false;
  recompute();
});
tapSizeEl.addEventListener('change', recompute);
tapFineToggleEl.addEventListener('change', recompute);

refreshSizeOptions();
recompute();
