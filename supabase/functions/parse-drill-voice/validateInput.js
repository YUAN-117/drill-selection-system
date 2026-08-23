export const MAX_TRANSCRIPT_LENGTH = 100;

export function validateTranscript(text) {
  if (typeof text !== 'string') return { valid: false, reason: 'EMPTY' };
  const trimmed = text.trim();
  if (trimmed.length === 0) return { valid: false, reason: 'EMPTY' };
  if (trimmed.length > MAX_TRANSCRIPT_LENGTH) return { valid: false, reason: 'TOO_LONG' };
  return { valid: true, reason: null };
}
