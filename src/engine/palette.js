import { NOTE_NAMES } from '../lib/format.js';
import { LOUDNESS, LOUDNESS_RANGE } from './model.js';
import { ROLES, soundsForRole } from './roles.js';

// A set's palette: the key its notes stay in or near, how loud each tier of interaction is, and the
// room its sounds share. Applying it rewrites the sounds themselves, so an exported sound never
// depends on the set it came from.

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

// A pentatonic key sits inside a seven-note scale. Material's guidance allows the same or
// complementary keys, so notes from that wider scale count as related rather than wrong.
const WIDER = { 'major-pentatonic': 'major', 'minor-pentatonic': 'minor' };
export const widerKey = (key) => (WIDER[key.scale] ? { root: key.root, scale: WIDER[key.scale] } : null);
const relatedSteps = (key) => SCALES[WIDER[key.scale] || key.scale].steps;

export const midiOf = (hz) => 69 + 12 * Math.log2(hz / 440);
export const hzOf = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// The pitch a layer starts on, the pitch it ends on and how long its slide takes, or null for a
// layer with no note. Recordings have one when samplePitch(id) finds it.
export function layerPitch(L, samplePitch = () => null) {
  if (L.type === 'tone') return [L.pitchStart, L.glide > 0 ? L.pitchEnd : L.pitchStart, L.glide];
  if (L.type === 'modal') return [L.freq, L.freq, 0];
  const base = L.type === 'sample' ? samplePitch(L.sampleId) : null;
  return base ? [base * 2 ** (L.pitch / 12), base * 2 ** ((L.glide > 0 ? L.slideTo : L.pitch) / 12), L.glide] : null;
}

// The layers you hear: switched on, and the soloed ones while any layer is soloed.
export function audibleLayers(patch) {
  const anySolo = patch.layers.some((L) => L.on && L.solo);
  return patch.layers.filter((L) => L.on && (!anySolo || L.solo));
}

function centsFromSteps(hz, root, steps) {
  const midi = midiOf(hz);
  let best = Infinity;
  for (const step of steps) {
    const d = ((((midi - root - step) % 12) + 18) % 12) - 6;
    best = Math.min(best, Math.abs(d) * 100);
  }
  return best;
}

// How far a pitch sits from the nearest note of the key, or of the key and its related notes, in cents.
export const centsFromKey = (hz, key) => centsFromSteps(hz, key.root, SCALES[key.scale].steps);
export const centsFromRelated = (hz, key) => centsFromSteps(hz, key.root, relatedSteps(key));

function nearestNote(midi, root, steps) {
  let best = null;
  const o0 = Math.floor((midi - root) / 12);
  for (let o = o0 - 1; o <= o0 + 1; o++)
    steps.forEach((step, index) => {
      const note = root + 12 * o + step;
      if (!best || Math.abs(midi - note) < Math.abs(midi - best.note)) best = { note, index, octave: o };
    });
  return best;
}

// The same place in another scale: the same step, in the copy of the scale nearest the old one, so
// a change of key never moves the set more than half an octave.
function place({ note, index, octave }, from, to, fromSteps, toSteps) {
  const shift = ((to.root - from.root + 18) % 12) - 6;
  if (fromSteps.length === toSteps.length) return from.root + shift + 12 * octave + toSteps[index];
  return nearestNote(note + shift, to.root, toSteps).note;
}

// Moves a pitch, in MIDI note numbers, from one key into another. A note of the old key takes the
// same step of the new one, so a tune keeps its shape, and a note of the wider scale keeps its step
// in that. Whatever sits off those notes, a slight detune or a clash, keeps its distance. With no
// old key to go by, each note moves to the nearest note of the new key.
export function retuneMidi(midi, from, to) {
  if (!to) return midi;
  if (!from) return nearestNote(midi, to.root, SCALES[to.scale].steps).note;
  const keyNote = nearestNote(midi, from.root, SCALES[from.scale].steps);
  const inKey = Math.abs(midi - keyNote.note) < 0.5;
  const fromSteps = inKey ? SCALES[from.scale].steps : relatedSteps(from);
  const toSteps = inKey ? SCALES[to.scale].steps : relatedSteps(to);
  const near = inKey ? keyNote : nearestNote(midi, from.root, fromSteps);
  return place(near, from, to, fromSteps, toSteps) + (midi - near.note);
}

const TONE_RANGE = [20, 12000];
const OBJECT_RANGE = [40, 8000];
const SAMPLE_RANGE = [-24, 24];
// A move of less than a cent can't be heard, so it isn't made, and a sound already in key is left as it is.
const UNMOVED = 0.01;
const within = (v, [min, max]) => Math.min(max, Math.max(min, v));

// Retunes a sound in place and says whether any note moved. Tones and struck objects move, and so do
// recordings with a clear pitch; noise has none. A sound that clashes on purpose keeps its clash
// through a change of key, and is left alone when a key is first picked, since moving it to the
// nearest note would take the clash away.
export function retunePatch(patch, from, to, samplePitch = () => null) {
  if (!to || (!from && patch.tension)) return false;
  let moved = false;
  // midi is the note L[k] plays now; toValue turns the note it moves to back into a value for L[k].
  const move = (L, k, midi, toValue, range) => {
    const next = retuneMidi(midi, from, to);
    if (Math.abs(next - midi) < UNMOVED) return;
    L[k] = within(toValue(next), range);
    moved = true;
  };
  for (const L of patch.layers) {
    if (L.type === 'tone') {
      move(L, 'pitchStart', midiOf(L.pitchStart), hzOf, TONE_RANGE);
      move(L, 'pitchEnd', midiOf(L.pitchEnd), hzOf, TONE_RANGE);
    } else if (L.type === 'modal') move(L, 'freq', midiOf(L.freq), hzOf, OBJECT_RANGE);
    else if (L.type === 'sample') {
      const base = samplePitch(L.sampleId);
      if (!base) continue;
      const m0 = midiOf(base);
      move(L, 'pitch', m0 + L.pitch, (m) => m - m0, SAMPLE_RANGE);
      move(L, 'slideTo', m0 + L.slideTo, (m) => m - m0, SAMPLE_RANGE);
    }
  }
  return moved;
}

export const TIER_LABEL = { frequent: 'Frequent sounds', confirm: 'Confirmations', alert: 'Alerts' };
const TIER_RANK = { frequent: 0, confirm: 1, alert: 2 };

export function normalizeLoudness(raw) {
  const out = { ...LOUDNESS };
  if (raw && typeof raw === 'object') for (const k of Object.keys(LOUDNESS)) if (Number.isFinite(raw[k])) out[k] = within(raw[k], LOUDNESS_RANGE);
  return out;
}

// The tier a sound plays in: the loudest among the interactions it plays for, or null for none.
export function tierOf(set, soundId) {
  let tier = null;
  for (const r of ROLES) if (soundsForRole(set, r.id).some((s) => s.id === soundId) && (!tier || TIER_RANK[r.tier] > TIER_RANK[tier])) tier = r.tier;
  return tier;
}

// A shared room is the space itself. How much of it each sound uses stays its own, since frequent
// sounds are usually drier than the rest.
export const ROOM_KEYS = ['reverbType', 'reverbSize', 'reverbDamping', 'reverbPredelay', 'reverbReverse'];
