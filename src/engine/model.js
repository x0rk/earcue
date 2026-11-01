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

// Effects any layer can stack, in order. Each has its defaults and the widest values data may hold.
export const FX_TYPES = {
  eq: { label: 'EQ', defaults: { low: 0, mid: 0, midFreq: 1500, high: 0 }, limits: { low: [-18, 12], mid: [-18, 12], midFreq: [200, 8000], high: [-18, 12] } },
  comp: { label: 'Compressor', defaults: { threshold: -24, ratio: 4, speed: 10, makeup: 0 }, limits: { threshold: [-60, 0], ratio: [1, 20], speed: [1, 200], makeup: [0, 24] } },
  chorus: { label: 'Chorus', defaults: { rate: 0.8, depth: 0.5, mix: 0.5 }, limits: { rate: [0.05, 8], depth: [0, 1], mix: [0, 1] } },
  flanger: { label: 'Flanger', defaults: { rate: 0.4, depth: 0.6, feedback: 0.5, mix: 0.5 }, limits: { rate: [0.05, 8], depth: [0, 1], feedback: [0, 0.95], mix: [0, 1] } },
  phaser: { label: 'Phaser', defaults: { rate: 0.5, depth: 0.6, feedback: 0.3, mix: 0.6 }, limits: { rate: [0.05, 8], depth: [0, 1], feedback: [0, 0.9], mix: [0, 1] } },
  crush: { label: 'Bitcrusher', defaults: { bits: 6, mix: 1 }, limits: { bits: [1, 16, true], mix: [0, 1] } },
};
export const MAX_FX = 6;
export const REVERB_TYPES = ['room', 'hall', 'plate', 'spring'];

export const fxDefaults = (type) => ({ id: uid(), type, on: true, ...FX_TYPES[type].defaults });

// Clean up settings for audio layers. The gate's bottom value means off; hum is 0 (off), 50 or 60 Hz.
export const GATE_OFF_DB = -80;
export const HUM_OPTIONS = [0, 50, 60];

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
    fx: [],
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
    Object.assign(base, {
      sampleId: null,
      sampleName: '',
      trimStart: 0,
      trimEnd: 0,
      pitch: 0,
      slideTo: 0,
      glide: 0,
      reverse: false,
      fadeIn: 0,
      fadeOut: 5,
      attack: 0,
      denoise: 0,
      gate: GATE_OFF_DB,
      hum: 0,
    });
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
    reverbType: 'room',
    reverbReverse: false,
    delayMix: 0,
    delayTime: 90,
    delayFeedback: 0.25,
    delayTone: 5000,
    out: -18,
    fade: 8,
    variation: 0,
    limit: 0,
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

// The note palette for the starter set: B-flat major pentatonic, so any two notes sound fine together.
const NOTE = { D5: 587.33, G5: 783.99, Bb5: 932.33, C6: 1046.5, D6: 1174.66, F6: 1396.91, G6: 1567.98, Bb6: 1864.66 };
// One shared room, and loudness by how often a sound plays: frequent ones quiet, alerts loudest.
const ROOM = { reverbSize: 0.25, reverbDamping: 0.5 };
const SUBTLE = -24;
const DEFAULT = -20;
const ALERT = -18;

// The sounds most products need, built as one family: one key, one soft material, one room. Taps are
// shortest and quietest, alerts longest; rising means something good, falling means an ending.
export function starterSounds() {
  const note = (name, hz, over) => mk('tone', { name, pitchStart: hz, pitchEnd: hz, attack: 1, ...over });
  const click = (over) => mk('noise', { name: 'Click', attack: 0.1, decay: 5, filter: { type: 'bandpass', freq: 4800, q: 1.2 }, ...over });
  return [
    patchOf('Tap', 'Buttons and small taps. Short and quiet, because it plays all the time.', [
      mk('tone', { name: 'Body', wave: 'triangle', pitchStart: NOTE.D6, pitchEnd: NOTE.Bb5, glide: 12, attack: 0.3, decay: 32 }),
      click({ level: -9 }),
    ], { ...ROOM, hpf: 300, reverbMix: 0.05, out: SUBTLE, variation: 20 }),
    patchOf('Toggle on', 'Switching something on. Two notes that rise; Toggle off is the same pair reversed.', [
      click({ level: -12 }),
      note('Low', NOTE.D6, { wave: 'triangle', attack: 0.4, decay: 30, level: -3 }),
      note('High', NOTE.G6, { wave: 'triangle', start: 35, attack: 0.4, decay: 45 }),
    ], { ...ROOM, hpf: 300, reverbMix: 0.06, out: SUBTLE, variation: 10 }),
    patchOf('Toggle off', 'Switching something off. The Toggle on notes, falling.', [
      click({ level: -12 }),
      note('High', NOTE.G6, { wave: 'triangle', attack: 0.4, decay: 30, level: -3 }),
      note('Low', NOTE.D6, { wave: 'triangle', start: 35, attack: 0.4, decay: 40 }),
    ], { ...ROOM, hpf: 300, reverbMix: 0.06, out: SUBTLE, variation: 10 }),
    patchOf('Send', 'Sending a message or submitting a form. A quick lift that lands on a note.', [
      mk('noise', { name: 'Air', color: 'pink', attack: 3, decay: 55, level: -10, filter: { type: 'bandpass', freq: 2600, q: 1.4, envAmt: -1.5, envTime: 60 } }),
      mk('tone', { name: 'Pop', start: 30, pitchStart: NOTE.C6, pitchEnd: NOTE.F6, glide: 30, attack: 0.5, decay: 80 }),
    ], { ...ROOM, hpf: 250, reverbMix: 0.1, out: DEFAULT }),
    patchOf('Receive', 'A message or an item arriving. Two soft notes that settle downward.', [
      note('Note 1', NOTE.F6, { decay: 90, level: -2, fmRatio: 2, fmIndex: 0.4, fmDecay: 30 }),
      note('Note 2', NOTE.C6, { start: 75, decay: 140, fmRatio: 2, fmIndex: 0.4, fmDecay: 30 }),
    ], { ...ROOM, hpf: 250, reverbMix: 0.1, out: DEFAULT }),
    patchOf('Success', 'A task done. Three rising notes, because rising sounds positive.', [
      note('Note 1', NOTE.D6, { decay: 90, level: -4 }),
      note('Note 2', NOTE.F6, { start: 60, decay: 100, level: -2 }),
      note('Note 3', NOTE.Bb6, { start: 120, decay: 135, fmRatio: 2, fmIndex: 0.3, fmDecay: 60 }),
    ], { ...ROOM, hpf: 250, reverbMix: 0.12, out: DEFAULT }),
    patchOf('Error', 'Something went wrong. Two falling notes with a little edge, never harsh.', [
      note('Note 1', NOTE.G5, { wave: 'square', decay: 70, level: -3, filter: { type: 'lowpass', freq: 2200, q: 0.7 } }),
      note('Note 2', NOTE.D5, { wave: 'square', start: 110, decay: 200, filter: { type: 'lowpass', freq: 2000, q: 0.7 } }),
    ], { ...ROOM, hpf: 250, reverbMix: 0.1, out: ALERT }),
    patchOf('Notification', 'Something needs attention. The longest and brightest sound in the set.', [
      note('Chime 1', NOTE.F6, { decay: 260, level: -3, fmRatio: 3.5, fmIndex: 0.7, fmDecay: 40 }),
      note('Chime 2', NOTE.Bb6, { start: 110, decay: 380, fmRatio: 3.5, fmIndex: 0.7, fmDecay: 50 }),
    ], { ...ROOM, hpf: 250, reverbMix: 0.14, out: ALERT }),
  ];
}

const OPPOSITE_WORDS = [
  ['on', 'off'],
  ['open', 'close'],
  ['in', 'out'],
  ['up', 'down'],
  ['show', 'hide'],
  ['expand', 'collapse'],
  ['send', 'receive'],
  ['success', 'error'],
  ['connect', 'disconnect'],
];

function oppositeName(name) {
  for (const [a, b] of OPPOSITE_WORDS) {
    for (const [from, to] of [
      [a, b],
      [b, a],
    ]) {
      const m = name.match(new RegExp(`\\b${from}\\b`, 'i'));
      if (!m) continue;
      const word = m[0][0] === m[0][0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to;
      return name.slice(0, m.index) + word + name.slice(m.index + from.length);
    }
  }
  return `${name} reversed`;
}

// The study's rule for siblings: an opposite is the same motif reversed. Pitched layers play in reverse
// order and every slide or sweep runs the other way, so rising becomes falling. Clicks and air stay put.
export function oppositePatch(patch) {
  const pitched = (L) => L.type !== 'noise';
  const last = Math.max(0, ...patch.layers.filter(pitched).map((L) => L.start));
  return {
    ...structuredClone(patch),
    id: uid(),
    name: oppositeName(patch.name),
    layers: patch.layers.map((L) => {
      const M = { ...structuredClone(L), id: uid() };
      if (pitched(L)) M.start = Math.round((last - L.start) * 10) / 10;
      if (L.type === 'tone') Object.assign(M, { pitchStart: L.pitchEnd, pitchEnd: L.pitchStart });
      if (L.type === 'sample' && L.glide > 0) Object.assign(M, { pitch: L.slideTo, slideTo: L.pitch });
      if (L.filter.envAmt) M.filter.envAmt = -L.filter.envAmt;
      return M;
    }),
  };
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
// Cuts by characters rather than UTF-16 units, so an emoji at the limit is kept whole, never halved.
export const clip = (s, max) => (s.length <= max ? s : Array.from(s).slice(0, max).join(''));
export const cleanName = (s, max) => clip(oneLine(s).trim(), max);

export const MAX_LAYERS = 64;
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
    slideTo: [-24, 24],
    fadeIn: [0, 300],
    fadeOut: [0, 3000],
    denoise: [0, 1],
    gate: [GATE_OFF_DB, -20],
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
    limit: [0, 12],
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

function normalizeFx(f) {
  if (!f || typeof f !== 'object' || !Object.hasOwn(FX_TYPES, f.type)) return null;
  const base = fxDefaults(f.type);
  const out = { ...base, ...pickKnown(f, base) };
  if (typeof f.id === 'string') out.id = f.id;
  return clampTo(out, FX_TYPES[f.type].limits);
}

export function normalizeLayer(l) {
  if (!l || !LAYER_TYPES.includes(l.type)) return null;
  const base = layerDefaults(l.type);
  const out = { ...base, ...pickKnown(l, base) };
  out.filter = { ...base.filter, ...pickKnown(l.filter, base.filter) };
  out.lfo = { ...base.lfo, ...pickKnown(l.lfo, base.lfo) };
  out.fx = Array.isArray(l.fx) ? l.fx.slice(0, MAX_FX).map(normalizeFx).filter(Boolean) : [];
  if (typeof l.id === 'string') out.id = l.id;
  if (l.type === 'sample') {
    out.sampleId = typeof l.sampleId === 'string' ? l.sampleId : null;
    if (!HUM_OPTIONS.includes(out.hum)) out.hum = 0;
  }
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

function normalizeMaster(m) {
  const out = clampTo({ ...masterDefaults(), ...pickKnown(m, masterDefaults()) }, LIMITS.master);
  if (!REVERB_TYPES.includes(out.reverbType)) out.reverbType = 'room';
  return out;
}

export function normalizePatch(p) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.layers)) return null;
  return {
    id: typeof p.id === 'string' ? p.id : uid(),
    name: (typeof p.name === 'string' && cleanName(p.name, MAX_NAME)) || 'Untitled',
    description: typeof p.description === 'string' ? cleanName(p.description, 160) : '',
    seed: typeof p.seed === 'number' ? p.seed >>> 0 : randSeed(),
    layers: p.layers.slice(0, MAX_LAYERS).map(normalizeLayer).filter(Boolean),
    master: normalizeMaster(p.master),
  };
}

// Adds " 2", " 3" and so on, shortening the base so the result still fits in max characters.
export function uniqueName(base, names, max = MAX_NAME) {
  const cut = clip(base, max);
  if (!names.includes(cut)) return cut;
  for (let i = 2; ; i += 1) {
    const suffix = ` ${i}`;
    const name = `${clip(base, max - suffix.length)}${suffix}`;
    if (!names.includes(name)) return name;
  }
}

export function cloneLayerFresh(L) {
  return { ...structuredClone(L), id: uid() };
}
