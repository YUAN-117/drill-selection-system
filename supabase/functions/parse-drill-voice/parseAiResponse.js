const ALLOWED_ALLOY_KEYS = ['6061', '7075', 'a380'];
const MIN_DIAMETER = 1;
const MAX_DIAMETER = 32;

export function parseVoiceToolInput(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return null;
  const { diameter, alloy } = toolInput;
  if (typeof diameter !== 'number' || !Number.isFinite(diameter)) return null;
  if (diameter < MIN_DIAMETER || diameter > MAX_DIAMETER) return null;
  if (typeof alloy !== 'string' || !ALLOWED_ALLOY_KEYS.includes(alloy)) return null;
  return { diameter, alloy };
}
