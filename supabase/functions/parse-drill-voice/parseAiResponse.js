const ALLOWED_MATERIAL_KEYS = [
  'aluminum:6061',
  'aluminum:7075',
  'aluminum:a380',
  'copper:brass',
  'stainless:standard',
  'peek:standard',
  'pc:standard',
  'pom:standard'
];
const MIN_DIAMETER = 1;
const MAX_DIAMETER = 32;

export function parseVoiceToolInput(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return null;
  const { diameter, material } = toolInput;
  if (typeof diameter !== 'number' || !Number.isFinite(diameter)) return null;
  if (diameter < MIN_DIAMETER || diameter > MAX_DIAMETER) return null;
  if (typeof material !== 'string' || !ALLOWED_MATERIAL_KEYS.includes(material)) return null;
  return { diameter, material };
}
