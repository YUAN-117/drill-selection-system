import { WORKPIECE_MATERIALS } from '../core/materials.js';

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
  try {
    storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore quota errors / unavailable storage (e.g. Safari private browsing).
  }
}

function makeRecordId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export function addHistoryRecord(storage, diameter, materialKey, subtypeKey, drillToolType, result, depth) {
  const list = loadHistory(storage);
  const subtype = WORKPIECE_MATERIALS[materialKey].subtypes[subtypeKey];
  list.unshift({
    id: makeRecordId(),
    timestamp: new Date().toISOString(),
    diameter,
    materialKey,
    subtypeKey,
    materialLabel: subtype.label,
    drillMat: drillToolType,
    drillMatLabel: result.drillMatLabel,
    depth: depth ?? null,
    deepHoleWarning: result.deepHoleWarning ?? null,
    result
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
