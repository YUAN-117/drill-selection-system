import { loadHistory, deleteHistoryRecord, clearHistory } from '../data/historyStore.js';
import { renderHistoryList } from './historyView.js';

const historyList = document.getElementById('historyList');
const clearAllBtn = document.getElementById('clearAllBtn');
const confirmBar = document.getElementById('confirmBar');
const confirmClearBtn = document.getElementById('confirmClearBtn');
const cancelClearBtn = document.getElementById('cancelClearBtn');

function render() {
  historyList.innerHTML = renderHistoryList(loadHistory(localStorage));
}

historyList.addEventListener('click', (e) => {
  const btn = e.target.closest('.del-btn');
  if (!btn) return;
  deleteHistoryRecord(localStorage, btn.getAttribute('data-id'));
  render();
});

clearAllBtn.addEventListener('click', () => {
  confirmBar.style.display = 'flex';
});
cancelClearBtn.addEventListener('click', () => {
  confirmBar.style.display = 'none';
});
confirmClearBtn.addEventListener('click', () => {
  clearHistory(localStorage);
  confirmBar.style.display = 'none';
  render();
});

render();
