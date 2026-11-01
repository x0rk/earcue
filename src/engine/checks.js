import { NOTE_NAMES, hzToNote } from '../lib/format.js';
import { ROLES, roleLabel, soundForRole } from './roles.js';

// Checks that a set holds together, following the study's rules for UI sound families: start with the
// action, keep weight above what small speakers drop, keep lengths and loudness right for each role, and
// stay in one key.

export const SCALES = {
  'major-pentatonic': { label: 'major pentatonic', steps: [0, 2, 4, 7, 9] },
  'minor-pentatonic': { label: 'minor pentatonic', steps: [0, 3, 5, 7, 10] },
  major: { label: 'major', steps: [0, 2, 4, 5, 7, 9, 11] },
  minor: { label: 'minor', steps: [0, 2, 3, 5, 7, 8, 10] },
};
export const STARTER_KEY = { root: NOTE_NAMES.indexOf('Bb'), scale: 'major-pentatonic' };
export const describeKey = (key) => `${NOTE_NAMES[key.root]} ${SCALES[key.scale].label}`;

export function normalizeKey(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const root = Number.isInteger(raw.root) && raw.root >= 0 && raw.root < 12 ? raw.root : null;
  return root !== null && Object.hasOwn(SCALES, raw.scale) ? { root, scale: raw.scale } : null;
}

const TIER = {
  tap: 'micro',
  hover: 'micro',
  select: 'micro',
  'toggle-on': 'micro',
  'toggle-off': 'micro',
  open: 'confirm',
  close: 'confirm',
  send: 'confirm',
  receive: 'confirm',
  success: 'confirm',
  delete: 'confirm',
  error: 'alert',
  notification: 'alert',
};
// Audible length, measured down to -40 dB, so a little longer than the study's 60, 220 and 500 ms.
const BUDGET_MS = { micro: 100, confirm: 250, alert: 500 };
const LATE_MS = 5;
const BASS_SHARE = 0.2;
const KEY_TOLERANCE_CENTS = 30;
const FREQUENT = ['tap', 'hover', 'select', 'toggle-on', 'toggle-off'];
const ALERTS = ['error', 'notification'];

// How far a pitch sits from the nearest note of the key, in cents.
export function centsFromKey(hz, key) {
  const midi = 69 + 12 * Math.log2(hz / 440);
  let best = Infinity;
  for (const step of SCALES[key.scale].steps) {
    const d = ((((midi - key.root - step) % 12) + 18) % 12) - 6;
    best = Math.min(best, Math.abs(d) * 100);
  }
  return best;
}

function pitchesOf(sound) {
  const out = [];
  for (const L of sound.layers) {
    if (!L.on) continue;
    if (L.type === 'tone') {
      out.push(L.pitchStart);
      if (L.glide > 0) out.push(L.pitchEnd);
    } else if (L.type === 'modal') out.push(L.freq);
  }
  return out;
}

// measures maps a sound id to the measurements from its render (res.m).
export function checkSet(set, measures) {
  const issues = [];
  const seen = new Set();
  const add = (sound, kind, text) => {
    if (seen.has(`${sound.id}:${kind}`)) return;
    seen.add(`${sound.id}:${kind}`);
    issues.push({ soundId: sound.id, name: sound.name, kind, text });
  };
  const rolesOf = new Map();
  for (const r of ROLES) {
    const s = soundForRole(set, r.id);
    if (s) rolesOf.set(s.id, [...(rolesOf.get(s.id) || []), r.id]);
  }
  for (const sound of set.sounds) {
    const m = measures.get(sound.id);
    if (!m) continue;
    if (!Number.isFinite(m.peakDb)) {
      add(sound, 'silent', 'Makes no sound yet.');
      continue;
    }
    if (m.onsetMs > LATE_MS) add(sound, 'late', `Starts ${Math.round(m.onsetMs)} ms after the action. A UI sound should start right away.`);
    if (m.lowShare > BASS_SHARE) add(sound, 'bass', `${Math.round(m.lowShare * 100)}% of it is below 250 Hz, which phone and laptop speakers can't play.`);
    for (const roleId of rolesOf.get(sound.id) || []) {
      const budget = BUDGET_MS[TIER[roleId]];
      if (m.audibleMs > budget) add(sound, 'long', `Lasts ${Math.round(m.audibleMs)} ms. As the ${roleLabel(roleId)} sound, keep it under ${budget} ms.`);
    }
    if (set.key) {
      const off = pitchesOf(sound).find((hz) => centsFromKey(hz, set.key) > KEY_TOLERANCE_CENTS);
      if (off) add(sound, 'key', `Plays ${hzToNote(off)}, outside ${describeKey(set.key)}.`);
    }
  }
  const byLoudness = (roleIds) =>
    roleIds
      .map((id) => soundForRole(set, id))
      .filter(Boolean)
      .map((s) => ({ s, rms: measures.get(s.id)?.rmsDb }))
      .filter((x) => Number.isFinite(x.rms));
  const alerts = byLoudness(ALERTS);
  if (alerts.length) {
    const quietest = alerts.reduce((a, b) => (b.rms < a.rms ? b : a));
    for (const f of byLoudness(FREQUENT)) {
      if (f.s.id !== quietest.s.id && f.rms >= quietest.rms) add(f.s, 'loud', `As loud as ${quietest.s.name} on average. Sounds that play often should be quieter than alerts.`);
    }
  }
  return issues;
}
