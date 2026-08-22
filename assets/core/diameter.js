// Standard metric twist drill sizes (DIN 338 series):
// 1.0-13.0mm every 0.1mm, 13.5-20.0mm every 0.5mm, 21-32mm every 1mm.
export function buildStandardSizes() {
  const round2 = (n) => Math.round(n * 100) / 100;
  const sizes = [];
  for (let i = 0; i <= 120; i++) sizes.push(round2(1.0 + i * 0.1));
  for (let j = 1; j <= 14; j++) sizes.push(round2(13.0 + j * 0.5));
  for (let k = 1; k <= 12; k++) sizes.push(round2(20.0 + k * 1.0));
  return sizes;
}

export const STANDARD_SIZES = buildStandardSizes();
const DIA_MIN = STANDARD_SIZES[0];
const DIA_MAX = STANDARD_SIZES[STANDARD_SIZES.length - 1];

export function nearestStandardDiameter(raw) {
  if (raw <= DIA_MIN) return DIA_MIN;
  if (raw >= DIA_MAX) return DIA_MAX;
  let best = STANDARD_SIZES[0];
  let bestDiff = Infinity;
  for (const size of STANDARD_SIZES) {
    const diff = Math.abs(size - raw);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = size;
    }
  }
  return best;
}
