import { getNominalSizes } from '../core/tapDrill.js';

export const TAP_DRILL_CAVEAT =
  '以上為公制 ISO 965 / 英制 UNC-UNF 標準 75% 牙深嚙合建議值,適用於一般材料;特殊材料或精度需求仍應依刀具廠商規格微調。';

function formatImperialSize(nominalSize) {
  return nominalSize.startsWith('#') ? nominalSize : nominalSize + '"';
}

export function renderSizeOptionsHtml(system) {
  return getNominalSizes(system)
    .map((size) => '<option value="' + size + '">' + size + '</option>')
    .join('');
}

export function renderTapResultHtml(result) {
  const sizeLabel = result.system === 'metric' ? result.nominalSize : formatImperialSize(result.nominalSize);
  const threadLabel =
    result.system === 'metric'
      ? sizeLabel + (result.isFine ? ' 細牙' : ' 粗牙') + '・螺距 ' + result.pitch + 'mm'
      : sizeLabel + '-' + result.tpi + ' ' + (result.isFine ? 'UNF' : 'UNC');
  return (
    '<div class="tap-result-line">' +
    threadLabel +
    ' → 建議底孔 <strong>' +
    result.standardDrillDiameter +
    ' mm</strong></div>' +
    '<div class="tap-caveat">' +
    TAP_DRILL_CAVEAT +
    '</div>'
  );
}
