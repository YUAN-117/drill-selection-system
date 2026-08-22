import { formatNumber } from '../core/format.js';

export const EMPTY_STATE_HTML =
  '<div class="empty-state">尚無記錄,到「鑽頭選擇」頁計算後按「加入記錄」即可保存於此</div>';

function renderRecordRows(results) {
  return results
    .map(
      (r) =>
        '<tr>' +
        '<td>' + r.drillMatLabel + '</td>' +
        '<td>' + formatNumber(r.rpm, 0) + ' RPM</td>' +
        '<td>' + formatNumber(r.f, 3) + ' mm/rev · ' + formatNumber(r.feedRate, 0) + ' mm/min</td>' +
        '</tr>'
    )
    .join('');
}

export function renderHistoryRecord(record) {
  const time = new Date(record.timestamp).toLocaleString('zh-TW');
  return (
    '<div class="history-record">' +
    '<div class="record-head">' +
    '<span class="record-title">' + record.diameter + 'mm · ' + record.alloyLabel + '</span>' +
    '<span class="record-time">' + time + '</span>' +
    '<button class="del-btn btn-ghost" data-id="' + record.id + '">刪除</button>' +
    '</div>' +
    '<table><thead><tr><th>材質</th><th>轉速</th><th>進給量</th></tr></thead><tbody>' +
    renderRecordRows(record.results) +
    '</tbody></table>' +
    '</div>'
  );
}

export function renderHistoryList(list) {
  if (list.length === 0) return EMPTY_STATE_HTML;
  return list.map(renderHistoryRecord).join('');
}
