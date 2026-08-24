import { getSession, signInWithGoogle, onAuthStateChange } from '../data/supabaseClient.js';
import { parseVoiceInput } from '../data/voiceParseClient.js';
import { addVoiceHistoryRecord } from '../data/voiceHistoryStore.js';
import { renderMicButtonLabel, renderErrorMessage, renderLoginStatus } from './voiceInputView.js';

const micBtn = document.getElementById('micBtn');
const loginBtn = document.getElementById('loginBtn');
const loginStatus = document.getElementById('loginStatus');
const voiceStatus = document.getElementById('voiceStatus');
const diameterEl = document.getElementById('diameter');
const alloyEl = document.getElementById('alloy');

const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

function setVoiceStatus(text, isError) {
  voiceStatus.textContent = text;
  voiceStatus.classList.toggle('voice-status-error', Boolean(isError));
}

function fillFormAndRecompute(diameter, alloy) {
  diameterEl.value = diameter;
  alloyEl.value = alloy;
  diameterEl.dispatchEvent(new Event('input', { bubbles: true }));
  alloyEl.dispatchEvent(new Event('change', { bubbles: true }));
}

async function handleTranscript(transcript, accessToken) {
  setVoiceStatus('辨識中...', false);
  const result = await parseVoiceInput({ fetchImpl: fetch, transcript, accessToken });
  if (!result.ok) {
    setVoiceStatus(renderErrorMessage(result.code), true);
    return;
  }
  fillFormAndRecompute(result.diameter, result.alloy);
  addVoiceHistoryRecord(localStorage, transcript, result.diameter, result.alloy);
  setVoiceStatus('已自動填入 ✓', false);
}

async function startListening() {
  const session = await getSession();
  if (!session) {
    setVoiceStatus(renderErrorMessage('NOT_AUTHENTICATED'), true);
    return;
  }

  const recognition = new SpeechRecognitionCtor();
  recognition.lang = 'zh-TW';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  micBtn.textContent = renderMicButtonLabel('listening');
  setVoiceStatus('聆聽中...請說出直徑與材質,例如「8mm 6061」', false);

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    micBtn.textContent = renderMicButtonLabel('processing');
    handleTranscript(transcript, session.access_token).finally(() => {
      micBtn.textContent = renderMicButtonLabel('idle');
    });
  };

  recognition.onerror = () => {
    micBtn.textContent = renderMicButtonLabel('idle');
    setVoiceStatus(renderErrorMessage('NETWORK_ERROR'), true);
  };

  recognition.onend = () => {
    micBtn.textContent = renderMicButtonLabel('idle');
  };

  recognition.start();
}

function updateLoginUi(session) {
  const { label, showLoginButton } = renderLoginStatus(session);
  loginStatus.textContent = label;
  loginBtn.style.display = showLoginButton ? '' : 'none';
}

if (!SpeechRecognitionCtor) {
  micBtn.disabled = true;
  setVoiceStatus(renderErrorMessage('NOT_SUPPORTED'), true);
} else {
  micBtn.addEventListener('click', startListening);
}

loginBtn.addEventListener('click', () => {
  signInWithGoogle();
});

onAuthStateChange(updateLoginUi);
getSession().then(updateLoginUi);
