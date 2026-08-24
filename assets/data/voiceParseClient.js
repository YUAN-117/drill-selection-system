export const EDGE_FUNCTION_URL = 'https://eefnzpqveljowridmhto.supabase.co/functions/v1/parse-drill-voice';

export async function parseVoiceInput({ fetchImpl, transcript, accessToken }) {
  let response;
  try {
    response = await fetchImpl(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ transcript })
    });
  } catch {
    return { ok: false, code: 'NETWORK_ERROR' };
  }

  try {
    return await response.json();
  } catch {
    return { ok: false, code: 'NETWORK_ERROR' };
  }
}
