import { getSession, signInWithGoogle, onAuthStateChange, supabase } from '../data/supabaseClient.js';
import { loadRecords, deleteRecord, clearRecords } from '../data/historyGateway.js';
import { renderHistoryList, LOADING_STATE_HTML, renderLoadErrorHtml } from './historyView.js';
import { renderLoginStatus } from './voiceInputView.js';

const historyList = document.getElementById('historyList');
const clearAllBtn = document.getElementById('clearAllBtn');
const confirmBar = document.getElementById('confirmBar');
const confirmClearBtn = document.getElementById('confirmClearBtn');
const cancelClearBtn = document.getElementById('cancelClearBtn');
const historyError = document.getElementById('historyError');
const historyDesc = document.getElementById('historyDesc');
const loginBtn = document.getElementById('loginBtn');
const loginStatus = document.getElementById('loginStatus');

let currentSession = null;

function setError(message) {
  if (!message) {
    historyError.style.display = 'none';
    historyError.textContent = '';
    return;
  }
  historyError.textContent = message;
  historyError.style.display = 'flex';
}

function updateDesc() {
  historyDesc.textContent = currentSession
    ? '已同步到雲端,登入同一個帳號就能在其他裝置看到'
    : '只保存在這個瀏覽器裡,換一台電腦或清除瀏覽器資料就看不到了';
}

async function render() {
  updateDesc();
  historyList.innerHTML = LOADING_STATE_HTML;
  try {
    const list = await loadRecords(currentSession, localStorage, supabase);
    historyList.innerHTML = renderHistoryList(list);
  } catch {
    historyList.innerHTML = renderLoadErrorHtml('無法載入雲端紀錄,請檢查網路連線後重新整理');
  }
}

historyList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.del-btn');
  if (!btn) return;
  try {
    await deleteRecord(currentSession, localStorage, supabase, btn.getAttribute('data-id'));
    setError(null);
    render();
  } catch {
    setError('刪除失敗,請稍後再試');
  }
});

clearAllBtn.addEventListener('click', () => { confirmBar.style.display = 'flex'; });
cancelClearBtn.addEventListener('click', () => { confirmBar.style.display = 'none'; });
confirmClearBtn.addEventListener('click', async () => {
  confirmBar.style.display = 'none';
  try {
    await clearRecords(currentSession, localStorage, supabase);
    setError(null);
    render();
  } catch {
    setError('清空失敗,請稍後再試');
  }
});

function updateLoginUi(session) {
  currentSession = session;
  const { label, showLoginButton } = renderLoginStatus(session);
  loginStatus.textContent = label;
  loginBtn.style.display = showLoginButton ? '' : 'none';
  render();
}

loginBtn.addEventListener('click', () => {
  signInWithGoogle();
});

onAuthStateChange(updateLoginUi);
getSession().then(updateLoginUi);
