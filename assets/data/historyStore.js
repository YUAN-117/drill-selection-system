import { ALLOY_LABELS } from '../core/materials.js';

export const HISTORY_STORAGE_KEY = 'drillSelectionHistory_v1';

export function loadHistory(storage) {
  try {
    const raw = storage.getItem(HISTORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveHistory(storage, list) {
  storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(list));
}

function makeRecordId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export function addHistoryRecord(storage, diameter, alloyKey, results) {
  const list = loadHistory(storage);
  list.unshift({
    id: makeRecordId(),
    timestamp: new Date().toISOString(),
    diameter,
    alloy: alloyKey,
    alloyLabel: ALLOY_LABELS[alloyKey],
    results
  });
  saveHistory(storage, list);
  return list;
}

export function deleteHistoryRecord(storage, id) {
  const list = loadHistory(storage).filter((record) => record.id !== id);
  saveHistory(storage, list);
  return list;
}

export function clearHistory(storage) {
  saveHistory(storage, []);
  return [];
}
