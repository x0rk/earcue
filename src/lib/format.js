const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export function hzToNote(f) {
  if (!(f > 0)) return '';
  const m = 12 * Math.log2(f / 440) + 69;
  const n = Math.round(m);
  const c = Math.round((m - n) * 100);
  return `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}${c ? (c > 0 ? ` +${c}c` : ` ${c}c`) : ''}`;
}

export const fmtHz = (f) => (f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 1 : 2).replace(/\.?0+$/, '')}k` : `${Math.round(f)}`);
export const fmtHzUnit = (f) => (f >= 1000 ? `${fmtHz(f)}Hz` : `${Math.round(f)} Hz`);
export const fmtDb = (v) => (Number.isFinite(v) ? v.toFixed(1) : '-inf');
export const fmtNum = (v, digits = 0) => String(Number(v.toFixed(digits)));
export const fmtSigned = (v, digits = 1) => `${v > 0 ? '+' : ''}${v.toFixed(digits)}`;
export const fmtPan = (v) => (Math.abs(v) < 0.005 ? 'Center' : `${Math.round(Math.abs(v) * 100)}% ${v < 0 ? 'L' : 'R'}`);
