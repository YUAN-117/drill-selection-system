import { formatNumber } from '../core/format.js';
import { WORKPIECE_MATERIALS, DRILL_TOOL_TYPES, DRILL_TOOL_LABELS } from '../core/materials.js';

export const EMPTY_RESULT_ROW =
  '<tr><td colspan="6" style="color: var(--readout-text-dim); padding: 20px 14px;">輸入直徑後顯示結果</td></tr>';

export const GUIDANCE_DEFAULT_TEXT = '選擇材料材質並輸入直徑後,顯示選用原則';

export function renderMaterialOptionsHtml() {
  return Object.entries(WORKPIECE_MATERIALS)
    .map(([materialKey, material]) => {
      const subtypeEntries = Object.entries(material.subtypes);
      if (subtypeEntries.length > 1) {
        const options = subtypeEntries
          .map(
            ([subtypeKey, subtype]) =>
              '<option value="' + materialKey + ':' + subtypeKey + '">' + subtype.label + '</option>'
          )
          .join('');
        return '<optgroup label="' + material.label + '">' + options + '</optgroup>';
      }
      const [subtypeKey, subtype] = subtypeEntries[0];
      return '<option value="' + materialKey + ':' + subtypeKey + '">' + subtype.label + '</option>';
    })
    .join('');
}

export function renderDrillMatOptionsHtml(materialKey) {
  const material = WORKPIECE_MATERIALS[materialKey];
  return DRILL_TOOL_TYPES.map((type) => {
    const range = material.drillVc[type];
    return (
      '<option value="' + type + '">' + DRILL_TOOL_LABELS[type] + '(建議 ' + range.min + '–' + range.max + ' m/min)</option>'
    );
  }).join('');
}

export function renderResultRow(result, materialKey) {
  const range = WORKPIECE_MATERIALS[materialKey].drillVc[result.drillMat];
  const confidenceNote = result.lowConfidence ? ' ⚠ 推估參考' : '';
  return (
    '<tr>' +
    '<td class="mat-name">' + result.drillMatLabel + confidenceNote + '</td>' +
    '<td>' + range.min + '–' + range.max + ' m/min</td>' +
    '<td>' + formatNumber(result.vc, 0) + ' m/min</td>' +
    '<td class="rpm-cell">' + formatNumber(result.rpm, 0) + '</td>' +
    '<td>' + formatNumber(result.f, 3) + ' mm/rev</td>' +
    '<td class="feed-cell">' + formatNumber(result.feedRate, 0) + ' mm/min</td>' +
    '</tr>'
  );
}

export function renderGuidanceHtml(materialKey) {
  return WORKPIECE_MATERIALS[materialKey].caveat;
}

export function renderDiameterHint(rawDiameter, normalizedDiameter) {
  if (Math.abs(rawDiameter - normalizedDiameter) < 0.001) {
    return '✓ 市售標準鑽頭尺寸';
  }
  return '⚙ ' + rawDiameter + 'mm 非市售規格,已對應到最接近的 <strong>' + normalizedDiameter + ' mm</strong> 計算';
}
