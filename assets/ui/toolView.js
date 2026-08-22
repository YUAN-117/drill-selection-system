import { formatNumber } from '../core/format.js';
import { DRILL_MATERIALS } from '../core/materials.js';

export const EMPTY_COMPARE_ROW =
  '<tr><td colspan="6" style="color: var(--readout-text-dim); padding: 20px 14px;">輸入直徑後顯示比較結果</td></tr>';

export const GUIDANCE_DEFAULT_TEXT = '選擇材質並輸入直徑後,顯示選用原則';
export const GUIDANCE_RESULT_HTML =
  '一般用途或單件加工可選 <strong>高速鋼 HSS</strong>;長時間量產或需拉高轉速可選 <strong>硬質合金 / 塗層硬質合金</strong>。';

function vcRangeLabel(drillMatKey) {
  const material = DRILL_MATERIALS.find((m) => m.key === drillMatKey);
  return material.vcMin + '–' + material.vcMax + ' m/min';
}

export function renderCompareRows(results) {
  return results
    .map(
      (r) =>
        '<tr>' +
        '<td class="mat-name">' + r.drillMatLabel + '</td>' +
        '<td>' + vcRangeLabel(r.drillMat) + '</td>' +
        '<td>' + r.vc + ' m/min</td>' +
        '<td class="rpm-cell">' + formatNumber(r.rpm, 0) + '</td>' +
        '<td>' + formatNumber(r.f, 3) + ' mm/rev</td>' +
        '<td class="feed-cell">' + formatNumber(r.feedRate, 0) + ' mm/min</td>' +
        '</tr>'
    )
    .join('');
}

export function renderDiameterHint(rawDiameter, normalizedDiameter) {
  if (Math.abs(rawDiameter - normalizedDiameter) < 0.001) {
    return '✓ 市售標準鑽頭尺寸';
  }
  return '⚙ ' + rawDiameter + 'mm 非市售規格,已對應到最接近的 <strong>' + normalizedDiameter + ' mm</strong> 計算';
}
