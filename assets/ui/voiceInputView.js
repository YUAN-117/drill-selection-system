const MIC_LABELS = {
  idle: '🎤 語音輸入',
  listening: '🎙️ 聆聽中...點擊停止',
  processing: '⏳ 辨識中...'
};

export function renderMicButtonLabel(state) {
  return MIC_LABELS[state] ?? MIC_LABELS.idle;
}

const ERROR_MESSAGES = {
  NOT_AUTHENTICATED: '請先使用 Google 登入',
  EMPTY: '沒有聽到內容,請再說一次',
  TOO_LONG: '輸入過長,請簡短描述',
  RATE_LIMITED: '已達每小時使用上限,請稍後再試',
  PARSE_FAILED: '聽不懂,請重新說一次,記得說出直徑與材質',
  AI_UNAVAILABLE: 'AI 服務暫時無法使用,請稍後再試',
  NETWORK_ERROR: '網路連線異常,請稍後再試',
  NOT_SUPPORTED: '此瀏覽器不支援語音輸入'
};

export function renderErrorMessage(code) {
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.NETWORK_ERROR;
}

export function renderLoginStatus(session) {
  if (!session) {
    return { label: '未登入', showLoginButton: true };
  }
  const email = session.user?.email ?? '';
  return { label: `已登入:${email}`, showLoginButton: false };
}
