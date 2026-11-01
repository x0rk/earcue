import { MATERIALS } from './engine.js';

export const LAYER_TYPES = ['tone', 'noise', 'modal', 'sample'];
export const TYPE_LABEL = { tone: 'Tone', noise: 'Noise', modal: 'Object', sample: 'Audio' };
export const TYPE_BLURB = {
  tone: 'A pitched beep you can slide and shape',
  noise: 'Clicks, hiss and air',
  modal: 'A struck object: wood, glass, metal',
  sample: 'An audio file or a recording',
};

export const uid = () => Math.random().toString(36).slice(2, 10);
export const randSeed = () => (Math.random() * 2147483647) >>> 0;

export function layerDefaults(type) {
  const base = {
    id: uid(),
    name: TYPE_LABEL[type],
    type,
    on: true,
    solo: false,
    start: 0,
    level: 0,
    pan: 0,
    attack: 1,
    hold: 0,
    decay: 120,
    filter: { type: 'none', freq: 4000, q: 0.7, envAmt: 0, envTime: 40 },
    drive: 0,
    reverbSend: 1,
    delaySend: 1,
    lfo: { target: 'off', rate: 6, depth: 0.3 },
    seed: randSeed(),
  };
  if (type === 'tone') {
    Object.assign(base, { wave: 'sine', pitchStart: 440, pitchEnd: 440, glide: 0, voices: 1, detune: 8, fmRatio: 2, fmIndex: 0, fmDecay: 60 });
  }
  if (type === 'noise') {
    Object.assign(base, { color: 'white', attack: 0.3, decay: 20, filter: { type: 'bandpass', freq: 3000, q: 0.9, envAmt: 0, envTime: 40 } });
  }
  if (type === 'modal') {
    Object.assign(base, { freq: 900, material: 'bar', partials: 4, damping: 0.5, brightness: 0.4, strike: -14, attack: 0.3, decay: 150 });
  }
  if (type === 'sample') {
    Object.assign(base, { sampleId: null, sampleName: '', trimStart: 0, trimEnd: 0, pitch: 0, reverse: false, fadeIn: 0, fadeOut: 5, attack: 0 });
  }
  return base;
}

export function masterDefaults() {
  return {
    hpf: 20,
    lpf: 20000,
    low: 0,
    presence: 0,
    presenceFreq: 3000,
    air: 0,
    compOn: false,
    compThreshold: -18,
    compRatio: 3,
    compAttack: 3,
    compRelease: 80,
    compMakeup: 0,
    drive: 0,
    reverbMix: 0,
    reverbSize: 0.3,
    reverbDamping: 0.4,
    reverbPredelay: 0,
    delayMix: 0,
    delayTime: 90,
    delayFeedback: 0.25,
    delayTone: 5000,
    out: -18,
    fade: 8,
    variation: 0,
  };
}

const deepMerge = (base, over) => {
  const out = { ...base };
  for (const k of Object.keys(over)) {
    const v = over[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' ? deepMerge(base[k], v) : v;
  }
  return out;
};
const mk = (type, over) => deepMerge(layerDefaults(type), over);
const patchOf = (name, description, layers, master) => ({
  id: uid(),
  name,
  description,
  seed: randSeed(),
  layers,
  master: { ...masterDefaults(), ...master },
});

export function presets() {
  return [
    patchOf('Thock Light', 'A soft, light tap. Made for sending a message.', [
      mk('tone', { name: 'Body', pitchStart: 420, pitchEnd: 260, glide: 22, attack: 0.6, decay: 70 }),
      mk('noise', { name: 'Click', attack: 0.2, decay: 12, level: -8, reverbSend: 0.3, filter: { type: 'bandpass', freq: 3800, q: 0.9 } }),
      mk('tone', { name: 'Tick', wave: 'triangle', pitchStart: 1865, pitchEnd: 1865, attack: 0.3, decay: 28, level: -20 }),
    ], { hpf: 160, lpf: 14000, low: -3, presence: 2, presenceFreq: 3200, drive: 0.1, reverbMix: 0.1, reverbSize: 0.2, reverbDamping: 0.5, out: -18 }),
    patchOf('Thock Feather', 'Even lighter and airier than Thock Light.', [
      mk('tone', { name: 'Body', pitchStart: 560, pitchEnd: 380, glide: 16, attack: 0.5, decay: 50 }),
      mk('noise', { name: 'Air', attack: 0.2, decay: 7, level: -11, filter: { type: 'highpass', freq: 4800, q: 0.7 } }),
    ], { hpf: 260, presence: 1.5, presenceFreq: 4000, air: 1, reverbMix: 0.08, reverbSize: 0.16, out: -20 }),
    patchOf('Thock Glass', 'A light tap with a small glassy ring on top.', [
      mk('tone', { name: 'Body', pitchStart: 400, pitchEnd: 270, glide: 20, attack: 0.5, decay: 60 }),
      mk('tone', { name: 'Ring', pitchStart: 1865, pitchEnd: 1865, fmRatio: 3.5, fmIndex: 1.2, fmDecay: 25, attack: 0.4, decay: 90, level: -16 }),
      mk('noise', { name: 'Click', attack: 0.2, decay: 10, level: -10, filter: { type: 'bandpass', freq: 4200, q: 0.9 } }),
    ], { hpf: 180, reverbMix: 0.12, reverbSize: 0.22, out: -18 }),
    patchOf('Thock', 'A deeper, heavier key thud.', [
      mk('tone', { name: 'Body', pitchStart: 233, pitchEnd: 155, glide: 30, attack: 1, decay: 150 }),
      mk('noise', { name: 'Click', attack: 0.5, decay: 28, level: -7, filter: { type: 'lowpass', freq: 2475, q: 0.7 } }),
    ], { out: -20 }),
    patchOf('Pop', 'A bubbly pop. The pitch jumps up fast.', [
      mk('tone', { name: 'Bubble', pitchStart: 300, pitchEnd: 900, glide: 25, attack: 0.5, decay: 60 }),
      mk('noise', { name: 'Snap', attack: 0.1, decay: 6, level: -16, filter: { type: 'bandpass', freq: 2000, q: 1 } }),
    ], { hpf: 150, out: -20 }),
    patchOf('Toggle', 'A small, crisp switch click.', [
      mk('noise', { name: 'Click', attack: 0.1, decay: 6, filter: { type: 'bandpass', freq: 5000, q: 1.2 } }),
      mk('tone', { name: 'Tick', wave: 'triangle', pitchStart: 1200, pitchEnd: 900, glide: 8, attack: 0.2, decay: 22, level: -10 }),
    ], { hpf: 300, out: -22 }),
    patchOf('Success', 'Two rising notes, like a task completed.', [
      mk('tone', { name: 'Note 1', pitchStart: 880, pitchEnd: 880, attack: 1, decay: 120, level: -2 }),
      mk('tone', { name: 'Note 2', start: 70, pitchStart: 1318.5, pitchEnd: 1318.5, attack: 1, decay: 220 }),
    ], { hpf: 200, reverbMix: 0.12, reverbSize: 0.4, out: -20 }),
    patchOf('Error', 'A low double buzz that says something went wrong.', [
      mk('tone', { name: 'Buzz 1', wave: 'square', pitchStart: 220, pitchEnd: 220, attack: 1, decay: 70, filter: { type: 'lowpass', freq: 1800, q: 0.7 } }),
      mk('tone', { name: 'Buzz 2', wave: 'square', start: 110, pitchStart: 220, pitchEnd: 220, attack: 1, decay: 90, filter: { type: 'lowpass', freq: 1800, q: 0.7 } }),
    ], { hpf: 120, out: -22 }),
    patchOf('Keycap', 'A mechanical keyboard click.', [
      mk('tone', { name: 'Body', wave: 'triangle', pitchStart: 300, pitchEnd: 210, glide: 18, attack: 0.5, decay: 55 }),
      mk('noise', { name: 'Clack', attack: 0.2, decay: 16, level: -4, filter: { type: 'bandpass', freq: 2600, q: 1.8 } }),
      mk('noise', { name: 'Snap', attack: 0.1, decay: 5, level: -14, filter: { type: 'highpass', freq: 7000, q: 0.7 } }),
    ], { hpf: 120, drive: 0.2, reverbMix: 0.1, reverbSize: 0.18, out: -18 }),
    patchOf('Pebble', 'A small wooden knock.', [
      mk('modal', { name: 'Stone', material: 'wood', freq: 1100, partials: 4, decay: 70, damping: 0.7, brightness: 0.35, strike: -12 }),
    ], { hpf: 200, reverbMix: 0.06, out: -20 }),
    patchOf('Soft Tap', 'A gentle tap on a small metal bar.', [
      mk('modal', { name: 'Bar', material: 'bar', freq: 932, partials: 4, decay: 140, damping: 0.6, brightness: 0.45, strike: -10 }),
    ], { hpf: 150, out: -20 }),
    patchOf('Lift', 'A short swish that ends in a tick.', [
      mk('noise', { name: 'Swish', color: 'pink', attack: 80, decay: 40, level: -6, filter: { type: 'bandpass', freq: 1200, q: 2.5, envAmt: -1.5, envTime: 110 } }),
      mk('tone', { name: 'Tick', start: 110, pitchStart: 932, pitchEnd: 932, attack: 1, decay: 50 }),
    ], { hpf: 150, out: -20 }),
  ];
}

export function blankPatch(name) {
  return patchOf(name, '', [mk('tone', { name: 'Tone', pitchStart: 660, pitchEnd: 660, attack: 1, decay: 120 })], {});
}

export const ENUMS = {
  wave: ['sine', 'triangle', 'square', 'sawtooth'],
  color: ['white', 'pink', 'brown'],
  material: Object.keys(MATERIALS),
  ftype: ['none', 'lowpass', 'highpass', 'bandpass'],
  lfo: ['off', 'pitch', 'filter', 'amp'],
};

// Names are written into comments in exported code, so anything that could start a new line goes.
const LINE_BREAKING = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
export const oneLine = (s) => s.replace(LINE_BREAKING, ' ');
export const cleanName = (s, max) => oneLine(s).trim().slice(0, max);

const MAX_LAYERS = 64;
const MAX_START_MS = 6000; // the longest sound the app renders
const MAX_CLIP_MS = 600000;

// The widest value each number can take anywhere in the app. Saved and imported data is clamped
// to these, so a crafted project can't ask for half a million voices. Sliders may cover less.
const LIMITS = {
  layer: {
    start: [0, MAX_START_MS],
    level: [-48, 6],
    pan: [-1, 1],
    attack: [0, 300],
    hold: [0, 500],
    decay: [2, 3000],
    drive: [0, 1],
    reverbSend: [0, 1],
    delaySend: [0, 1],
    seed: [0, 0xffffffff, true],
    pitchStart: [20, 12000],
    pitchEnd: [20, 12000],
    glide: [0, 400],
    voices: [1, 5, true],
    detune: [0, 50],
    fmRatio: [0.25, 12],
    fmIndex: [0, 8],
    fmDecay: [2, 2000],
    freq: [40, 8000],
    partials: [1, 5, true],
    damping: [0, 1],
    brightness: [0, 1],
    strike: [-60, 0],
    trimStart: [0, MAX_CLIP_MS],
    trimEnd: [0, MAX_CLIP_MS],
    pitch: [-24, 24],
    fadeIn: [0, 200],
    fadeOut: [0, 500],
  },
  filter: { freq: [20, 20000], q: [0.1, 20], envAmt: [-6, 6], envTime: [1, 2000] },
  lfo: { rate: [0.1, 80], depth: [0, 1] },
  master: {
    hpf: [20, 2000],
    lpf: [500, 20000],
    low: [-18, 12],
    presence: [-18, 12],
    presenceFreq: [600, 10000],
    air: [-18, 12],
    compThreshold: [-60, 0],
    compRatio: [1, 20],
    compAttack: [0.1, 100],
    compRelease: [10, 1000],
    compMakeup: [0, 24],
    drive: [0, 1],
    reverbMix: [0, 1],
    reverbSize: [0.05, 3],
    reverbDamping: [0, 1],
    reverbPredelay: [0, 100],
    delayMix: [0, 1],
    delayTime: [5, 1000],
    delayFeedback: [0, 0.9],
    delayTone: [500, 20000],
    out: [-40, -1],
    fade: [0, 100],
    variation: [0, 100],
  },
};

function clampTo(values, limits) {
  for (const [k, [min, max, whole]] of Object.entries(limits)) {
    if (typeof values[k] !== 'number') continue;
    const v = Math.min(max, Math.max(min, values[k]));
    values[k] = whole ? Math.round(v) : v;
  }
  return values;
}

function pickKnown(src, base) {
  const out = {};
  if (!src || typeof src !== 'object') return out;
  for (const k of Object.keys(base)) {
    const v = src[k];
    if (typeof base[k] === 'number' && typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof base[k] === 'string' && typeof v === 'string') out[k] = cleanName(v, 120);
    else if (typeof base[k] === 'boolean' && typeof v === 'boolean') out[k] = v;
  }
  return out;
}

export function normalizeLayer(l) {
  if (!l || !LAYER_TYPES.includes(l.type)) return null;
  const base = layerDefaults(l.type);
  const out = { ...base, ...pickKnown(l, base) };
  out.filter = { ...base.filter, ...pickKnown(l.filter, base.filter) };
  out.lfo = { ...base.lfo, ...pickKnown(l.lfo, base.lfo) };
  if (typeof l.id === 'string') out.id = l.id;
  if (l.type === 'sample') out.sampleId = typeof l.sampleId === 'string' ? l.sampleId : null;
  if (out.wave && !ENUMS.wave.includes(out.wave)) out.wave = 'sine';
  if (out.color && !ENUMS.color.includes(out.color)) out.color = 'white';
  if (out.material && !ENUMS.material.includes(out.material)) out.material = 'bar';
  if (!ENUMS.ftype.includes(out.filter.type)) out.filter.type = 'none';
  if (!ENUMS.lfo.includes(out.lfo.target)) out.lfo.target = 'off';
  clampTo(out, LIMITS.layer);
  clampTo(out.filter, LIMITS.filter);
  clampTo(out.lfo, LIMITS.lfo);
  return out;
}

export const MAX_NAME = 60;

export function normalizePatch(p) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.layers)) return null;
  return {
    id: typeof p.id === 'string' ? p.id : uid(),
    name: (typeof p.name === 'string' && cleanName(p.name, MAX_NAME)) || 'Untitled',
    description: typeof p.description === 'string' ? cleanName(p.description, 160) : '',
    seed: typeof p.seed === 'number' ? p.seed >>> 0 : randSeed(),
    layers: p.layers.slice(0, MAX_LAYERS).map(normalizeLayer).filter(Boolean),
    master: clampTo({ ...masterDefaults(), ...pickKnown(p.master, masterDefaults()) }, LIMITS.master),
  };
}

// Adds " 2", " 3" and so on, shortening the base so the result still fits in max characters.
export function uniqueName(base, names, max = MAX_NAME) {
  if (!names.includes(base)) return base.slice(0, max);
  for (let i = 2; ; i += 1) {
    const suffix = ` ${i}`;
    const name = `${base.slice(0, max - suffix.length)}${suffix}`;
    if (!names.includes(name)) return name;
  }
}

export function cloneLayerFresh(L) {
  return { ...structuredClone(L), id: uid() };
}
