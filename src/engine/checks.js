import { hzToNote } from '../lib/format.js';
import { audibleLayers, centsFromRelated, describeKey, layerPitch, midiOf } from './palette.js';
import { ROLES, roleLabel, rolesInTier, SCENE, soundForRole } from './roles.js';

// Checks that a set holds together, following the study's rules for UI sound families: start with the
// action, keep weight above what small speakers drop, keep lengths and loudness right for each role,
// and keep the notes in or near one key, with no clash where one sound runs into the next.

// Audible length, measured down to -40 dB, so a little longer than the study's 60, 220 and 500 ms.
const BUDGET_MS = { frequent: 100, confirm: 250, alert: 500 };
const TIER_OF = Object.fromEntries(ROLES.map((r) => [r.id, r.tier]));
const LATE_MS = 5;
const BASS_SHARE = 0.2;
const KEY_TOLERANCE_CENTS = 30;
// A slide this quick is heard as the note it lands on, so only that note has to fit.
const PASSING_MS = 40;
const FREQUENT = rolesInTier('frequent');
const ALERTS = rolesInTier('alert');
// Interactions that often play right after one another, so the tail of one rings into the next.
const SEQUENCES = [['toggle-on', 'toggle-off'], ['toggle-off', 'toggle-on'], ...SCENE.slice(1).map((id, i) => [SCENE[i], id])];
// Distances between two notes that rub when they ring together, in semitones within an octave.
const CLASHES = { 1: 'a half step', 6: 'a tritone', 11: 'a major seventh' };

const fits = (hz, key) => centsFromRelated(hz, key) <= KEY_TOLERANCE_CENTS;

// The notes a sound plays, in the order they start. A quick slide only passes through its first note
// on the way to where it lands, so when it lands on a note that fits, only the landing counts.
export function notesOf(sound, key, samplePitch) {
  const notes = [];
  for (const L of audibleLayers(sound)) {
    const span = layerPitch(L, samplePitch);
    if (!span) continue;
    const [from, to, glide] = span;
    if (glide > 0 && from !== to) {
      if (!(glide <= PASSING_MS && (!key || fits(to, key)))) notes.push({ at: L.start, hz: from });
      notes.push({ at: L.start + glide, hz: to });
    } else notes.push({ at: L.start, hz: from });
  }
  return notes.sort((a, b) => a.at - b.at);
}

// measures maps a sound id to the measurements from its render (res.m).
export function checkSet(set, measures, { samplePitch } = {}) {
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
  const notes = new Map(set.sounds.map((s) => [s.id, notesOf(s, set.key, samplePitch)]));
  const audible = (sound) => Number.isFinite(measures.get(sound.id)?.peakDb);
  for (const sound of set.sounds) {
    const m = measures.get(sound.id);
    if (!m) continue;
    if (!audible(sound)) {
      add(sound, 'silent', 'Makes no sound yet.');
      continue;
    }
    if (m.onsetMs > LATE_MS) add(sound, 'late', `Starts ${Math.round(m.onsetMs)} ms after the action. A UI sound should start right away.`);
    if (m.lowShare > BASS_SHARE) add(sound, 'bass', `${Math.round(m.lowShare * 100)}% of it is below 250 Hz, which phone and laptop speakers can't play.`);
    for (const roleId of rolesOf.get(sound.id) || []) {
      const budget = BUDGET_MS[TIER_OF[roleId]];
      if (m.audibleMs > budget) add(sound, 'long', `Lasts ${Math.round(m.audibleMs)} ms. As the ${roleLabel(roleId)} sound, keep it under ${budget} ms.`);
    }
    if (set.key && !sound.tension) {
      const off = notes.get(sound.id).find((n) => !fits(n.hz, set.key));
      if (off) add(sound, 'key', `Plays ${hzToNote(off.hz)}, which doesn't fit ${describeKey(set.key)}. If it clashes on purpose, say so in its Output settings.`);
    }
  }
  if (set.key) {
    for (const [firstId, nextId] of SEQUENCES) {
      const a = soundForRole(set, firstId);
      const b = soundForRole(set, nextId);
      if (!a || !b || a.tension || b.tension || !audible(a) || !audible(b)) continue;
      const end = notes.get(a.id).at(-1);
      const start = notes.get(b.id)[0];
      const apart = end && start && CLASHES[Math.round(Math.abs(midiOf(start.hz) - midiOf(end.hz))) % 12];
      if (apart) add(b, 'clash', `Starts ${apart} from where ${a.name} ends (${hzToNote(end.hz)} to ${hzToNote(start.hz)}), so the two rub when one plays right after the other.`);
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
