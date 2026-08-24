export const VOICE_HISTORY_STORAGE_KEY = 'drillVoiceInputHistory_v1';
export const VOICE_HISTORY_MAX_RECORDS = 20;

export function loadVoiceHistory(storage) {
  try {
    const raw = storage.getItem(VOICE_HISTORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveVoiceHistory(storage, list) {
  try {
    storage.setItem(VOICE_HISTORY_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore quota errors / unavailable storage (e.g. Safari private browsing).
  }
}

function makeRecordId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export function addVoiceHistoryRecord(storage, transcript, diameter, alloy) {
  const list = loadVoiceHistory(storage);
  list.unshift({
    id: makeRecordId(),
    timestamp: new Date().toISOString(),
    transcript,
    diameter,
    alloy
  });
  const trimmed = list.slice(0, VOICE_HISTORY_MAX_RECORDS);
  saveVoiceHistory(storage, trimmed);
  return trimmed;
}
