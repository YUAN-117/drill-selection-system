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
