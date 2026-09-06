import { formatNumber } from '../core/format.js';

export const EMPTY_STATE_HTML =
  '<div class="empty-state">尚無記錄,到「鑽頭選擇」頁計算後按「加入記錄」即可保存於此</div>';

export function renderHistoryRecord(record) {
  const time = new Date(record.timestamp).toLocaleString('zh-TW');
  const confidenceNote = record.result.lowConfidence ? ' ⚠ 推估參考' : '';
  return (
    '<div class="history-record">' +
    '<div class="record-head">' +
    '<span class="record-title">' + record.diameter + 'mm · ' + record.materialLabel + '</span>' +
    '<span class="record-time">' + time + '</span>' +
    '<button class="del-btn btn-ghost" data-id="' + record.id + '">刪除</button>' +
    '</div>' +
    '<table><thead><tr><th>鑽頭材質</th><th>轉速</th><th>進給量</th></tr></thead><tbody>' +
    '<tr>' +
    '<td>' + record.drillMatLabel + confidenceNote + '</td>' +
    '<td>' + formatNumber(record.result.rpm, 0) + ' RPM</td>' +
    '<td>' + formatNumber(record.result.f, 3) + ' mm/rev · ' + formatNumber(record.result.feedRate, 0) + ' mm/min</td>' +
    '</tr>' +
    '</tbody></table>' +
    '</div>'
  );
}

export function renderHistoryList(list) {
  const validRecords = list.filter((record) => record.result);
  if (validRecords.length === 0) return EMPTY_STATE_HTML;
  return validRecords.map(renderHistoryRecord).join('');
}
