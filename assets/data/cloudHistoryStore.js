import { WORKPIECE_MATERIALS } from '../core/materials.js';

const TABLE = 'drill_history';

function rowToRecord(row) {
  return { id: String(row.id), timestamp: row.created_at, ...row.record };
}

export async function loadCloudHistory(supabase, userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(rowToRecord);
}

export async function addCloudHistoryRecord(supabase, userId, diameter, materialKey, subtypeKey, drillToolType, result, depth) {
  const subtype = WORKPIECE_MATERIALS[materialKey].subtypes[subtypeKey];
  const record = {
    diameter,
    materialKey,
    subtypeKey,
    materialLabel: subtype.label,
    drillMat: drillToolType,
    drillMatLabel: result.drillMatLabel,
    depth: depth ?? null,
    deepHoleWarning: result.deepHoleWarning ?? null,
    result
  };
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ user_id: userId, record })
    .select()
    .single();
  if (error) throw error;
  return rowToRecord(data);
}

export async function deleteCloudHistoryRecord(supabase, userId, id) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function clearCloudHistory(supabase, userId) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('user_id', userId);
  if (error) throw error;
}
