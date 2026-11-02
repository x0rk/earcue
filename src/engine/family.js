import { sampleRates, slideDuration } from './engine.js';
import { LOUDNESS, MAX_LAYERS, uid, uniqueName } from './model.js';
import { audibleLayers, hzOf, layerPitch, midiOf } from './palette.js';

// A family is a set made from one sound, the way a studio grows a product's sounds from one motif or
// one recording. Each interaction plays the source one or more times, every hit moved in time and
// pitch. The steps all sit in a major pentatonic scale on the source's own note, so the family shares
// that key; Error leans on a half step on purpose. Rising reads as good news and falling as an
// ending, as in the starter set.
const RECIPES = [
  { name: 'Tap', tier: 'frequent', variation: 20, about: 'once, short and quiet', hits: [{ max: 70 }] },
  { name: 'Toggle on', tier: 'frequent', variation: 10, about: 'twice, rising a fifth', hits: [{ max: 45, level: -3 }, { at: 35, st: 7, max: 55 }] },
  { name: 'Toggle off', tier: 'frequent', variation: 10, about: 'twice, falling a fifth', hits: [{ st: 7, max: 45, level: -3 }, { at: 35, max: 55 }] },
  { name: 'Send', tier: 'confirm', about: 'sliding up a fifth', hits: [{ slide: 7, max: 140 }] },
  { name: 'Receive', tier: 'confirm', about: 'twice, settling down a fifth', hits: [{ st: 7, max: 90, level: -2 }, { at: 75, max: 140 }] },
  { name: 'Success', tier: 'confirm', room: 0.04, about: 'three times, rising through a major chord', hits: [{ max: 90, level: -4 }, { at: 60, st: 4, max: 100, level: -2 }, { at: 120, st: 7, max: 130 }] },
  { name: 'Error', tier: 'alert', grit: 0.15, tension: true, about: 'twice, falling a half step, with some grit', hits: [{ st: -5, max: 80, level: -3 }, { at: 110, st: -6, max: 180 }] },
  { name: 'Notification', tier: 'alert', room: 0.06, about: 'twice, high and bright, with more room', hits: [{ st: 7, max: 260, level: -3 }, { at: 110, st: 12, max: 380 }] },
];

// Hits that go below the source would fall where small speakers drop the sound, so a recipe whose
// lowest note lands under this plays an octave up instead.
const LOWEST_HZ = 300;
// A slide that is added to a hit takes at least this long, so it is heard as a slide, not a click.
const SLIDE_MS = 30;
// A recording cut short fades out over this share of what is left, so it ends softly, not with a click.
const FADE_SHARE = 0.4;
const TONE_RANGE = [20, 12000];
const OBJECT_RANGE = [40, 8000];
const FILTER_RANGE = [20, 20000];
const SAMPLE_RANGE = [-24, 24];
const LEVEL_RANGE = [-48, 6];
const MIN_DECAY_MS = 2;

const within = (v, [min, max]) => Math.min(max, Math.max(min, v));
const ratio = (st) => 2 ** (st / 12);

// The source's main note: where its loudest pitched layer lands, or null when nothing has a pitch.
export function mainPitch(layers, samplePitch) {
  let best = null;
  for (const L of layers) {
    const span = layerPitch(L, samplePitch);
    if (span && (!best || L.level > best.level)) best = { hz: span[1], level: L.level };
  }
  return best ? best.hz : null;
}

// A copy of a layer, st semitones up. Its filter follows the pitch, so the timbre stays the same. A
// slide ends slide semitones above where the layer would land.
function transposed(L, st, slide, at) {
  const M = { ...structuredClone(L), id: uid(), solo: false, start: L.start + at };
  M.filter.freq = within(L.filter.freq * ratio(st), FILTER_RANGE);
  if (L.type === 'tone') {
    const landing = L.glide > 0 ? L.pitchEnd : L.pitchStart;
    M.pitchStart = within(L.pitchStart * ratio(st), TONE_RANGE);
    M.pitchEnd = within((slide ? landing : L.pitchEnd) * ratio(st + slide), TONE_RANGE);
  } else if (L.type === 'modal') M.freq = within(L.freq * ratio(st), OBJECT_RANGE);
  else if (L.type === 'sample') {
    const landing = L.glide > 0 ? L.slideTo : L.pitch;
    M.pitch = within(L.pitch + st, SAMPLE_RANGE);
    M.slideTo = within((slide ? landing : L.slideTo) + st + slide, SAMPLE_RANGE);
  }
  if (slide && (L.type === 'tone' || L.type === 'sample')) M.glide = Math.max(L.glide, SLIDE_MS);
  return M;
}

// Shortens a layer to play for at most maxMs. Synth layers decay sooner; recordings are cut and
// faded. Nothing is made longer.
function fitLength(M, maxMs, sampleMs) {
  if (M.type === 'sample') {
    const total = sampleMs(M.sampleId);
    if (!total) return;
    const kept = Math.max(1, total - M.trimStart - M.trimEnd);
    const { r0, r1, g } = sampleRates(M);
    const plays = slideDuration(kept / 1000, r0, r1, g) * 1000;
    if (plays <= maxMs) return;
    M.trimEnd += kept - kept * (maxMs / plays);
    M.fadeOut = Math.max(M.fadeOut, maxMs * FADE_SHARE);
    return;
  }
  M.attack = Math.min(M.attack, maxMs / 2);
  const hold = M.type === 'modal' ? 0 : M.hold;
  if (M.attack + hold + M.decay <= maxMs) return;
  const k = (maxMs - M.attack) / (hold + M.decay);
  if (M.type !== 'modal') M.hold *= k;
  M.decay = Math.max(MIN_DECAY_MS, M.decay * k);
}

function familySound(source, layers, recipe, { tune, rootHz, loudness, sampleMs }) {
  const lowest = Math.min(...recipe.hits.map((h) => h.st || 0));
  const lift = rootHz && lowest < 0 && rootHz * ratio(lowest) < LOWEST_HZ ? 12 : 0;
  // Every hit copies the source's layers, and a slide strikes objects twice, so a large source is
  // cut down to stay within the layer limit.
  const strikes = recipe.hits.reduce((n, hit) => n + (hit.slide ? 2 : 1), 0);
  const used = layers.slice(0, Math.max(1, Math.floor(MAX_LAYERS / strikes)));
  const out = [];
  const add = (M, hit, name) => {
    fitLength(M, hit.max, sampleMs);
    M.level = within(M.level + (hit.level || 0), LEVEL_RANGE);
    if (recipe.grit) M.drive = Math.min(1, M.drive + recipe.grit);
    M.name = uniqueName(name, out.map((x) => x.name));
    out.push(M);
  };
  recipe.hits.forEach((hit, i) => {
    const st = tune + lift + (hit.st || 0);
    const at = hit.at || 0;
    const slide = hit.slide || 0;
    for (const L of used) {
      const name = recipe.hits.length > 1 ? `${L.name} ${i + 1}` : L.name;
      add(transposed(L, st, L.type === 'modal' ? 0 : slide, at), hit, name);
      // A struck object can't slide, so it is struck again on the note the slide reaches.
      if (slide && L.type === 'modal') add(transposed(L, st + slide, 0, at + SLIDE_MS), hit, name);
    }
  });
  const master = { ...structuredClone(source.master), out: loudness[recipe.tier] };
  if (recipe.room) master.reverbMix = Math.min(1, master.reverbMix + recipe.room);
  // Only sounds heard over and over get pitch variation; an alert should sound the same every time.
  master.variation = recipe.variation || 0;
  return {
    id: uid(),
    name: recipe.name,
    description: `${source.name} ${recipe.about}.`,
    seed: source.seed,
    layers: out,
    master,
    ...(recipe.tension && { tension: true }),
  };
}

// Builds the eight interactions of a family from one sound, and the key they share: major pentatonic
// on the source's main note, with the family tuned to land exactly on it. A source with no clear
// pitch makes a family with no key. Returns null for a source with nothing to hear.
// samplePitch(id) gives a recording's pitch and sampleMs(id) its length, each null when unknown.
export function familyOf(source, { samplePitch = () => null, sampleMs = () => null, loudness = LOUDNESS } = {}) {
  const layers = audibleLayers(source);
  if (!layers.length) return null;
  const hz = mainPitch(layers, samplePitch);
  const midi = hz ? midiOf(hz) : null;
  const root = midi === null ? null : Math.round(midi);
  const opts = { tune: midi === null ? 0 : root - midi, rootHz: root === null ? null : hzOf(root), loudness, sampleMs };
  return {
    sounds: RECIPES.map((recipe) => familySound(source, layers, recipe, opts)),
    key: root === null ? null : { root: ((root % 12) + 12) % 12, scale: 'major-pentatonic' },
  };
}
