import { loadHistory, addHistoryRecord, deleteHistoryRecord, clearHistory } from './historyStore.js';
import { loadCloudHistory, addCloudHistoryRecord, deleteCloudHistoryRecord, clearCloudHistory } from './cloudHistoryStore.js';

export async function loadRecords(session, storage, supabase) {
  if (!session) return loadHistory(storage);
  return loadCloudHistory(supabase, session.user.id);
}

export async function addRecord(session, storage, supabase, diameter, materialKey, subtypeKey, drillToolType, result, depth) {
  if (!session) {
    const list = addHistoryRecord(storage, diameter, materialKey, subtypeKey, drillToolType, result, depth);
    return list[0];
  }
  return addCloudHistoryRecord(supabase, session.user.id, diameter, materialKey, subtypeKey, drillToolType, result, depth);
}

export async function deleteRecord(session, storage, supabase, id) {
  if (!session) {
    deleteHistoryRecord(storage, id);
    return;
  }
  return deleteCloudHistoryRecord(supabase, session.user.id, id);
}

export async function clearRecords(session, storage, supabase) {
  if (!session) {
    clearHistory(storage);
    return;
  }
  return clearCloudHistory(supabase, session.user.id);
}
