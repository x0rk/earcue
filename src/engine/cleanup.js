// Clean up for recordings: hum removal, noise reduction and a gate. It runs once on the clip, not while
// the sound plays, so the engine and exported code stay the same and exports ship the cleaned audio.
// The original clip is never changed; the cleaned copy is derived from the layer's settings.
import { fft } from './fft.js';
import { GATE_OFF_DB } from './model.js';
import { samples } from './samples.js';

const FRAME = 2048;
const HOP = FRAME / 4;
const NOISE_LEAD_GAP_MS = 5;
const MIN_NOISE_FRAMES = 3;
const QUIET_SHARE = 0.1;
const MAX_OVERSUBTRACT = 2;
const MAX_REDUCTION_DB = 30;
const RELEASE = 0.5;
const HUM_HARMONICS = 6;
// Wide enough to settle in a few tens of milliseconds, since UI recordings are short.
const HUM_Q = 8;
const HUM_PAD_S = 0.25;
const LEVEL_WINDOW_MS = 10;
const FLOOR_PERCENTILE = 0.1;
const ABOVE_FLOOR = 4;
const GATE_ATTACK_MS = 1;
const GATE_HOLD_MS = 15;
const GATE_RELEASE_MS = 40;
const CACHE_SIZE = 24;

export const isCleaned = (L) => L.type === 'sample' && (L.denoise > 0 || L.gate > GATE_OFF_DB || L.hum > 0);

const HANN = new Float64Array(FRAME);
for (let i = 0; i < FRAME; i++) HANN[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FRAME);

// RBJ notch, run forward and backward so the filter adds no phase shift. The clip is padded with a
// mirrored copy of its ends first, so the filter has settled before the real audio starts.
function notch(signal, sr, hz) {
  const pad = Math.min(signal.length - 1, Math.round(HUM_PAD_S * sr));
  const n = signal.length;
  const x = new Float64Array(n + 2 * pad);
  for (let i = 0; i < pad; i++) {
    x[i] = 2 * signal[0] - signal[pad - i];
    x[pad + n + i] = 2 * signal[n - 1] - signal[n - 2 - i];
  }
  x.set(signal, pad);
  const w = (2 * Math.PI * hz) / sr;
  const alpha = Math.sin(w) / (2 * HUM_Q);
  const a0 = 1 + alpha;
  const b0 = 1 / a0;
  const b1 = (-2 * Math.cos(w)) / a0;
  const a2 = (1 - alpha) / a0;
  const pass = (data, from, to, step) => {
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = from; i !== to; i += step) {
      const v = data[i];
      const y = b0 * v + b1 * x1 + b0 * x2 - b1 * y1 - a2 * y2;
      x2 = x1;
      x1 = v;
      y2 = y1;
      y1 = y;
      data[i] = y;
    }
  };
  pass(x, 0, x.length, 1);
  pass(x, x.length - 1, -1, -1);
  for (let i = 0; i < n; i++) signal[i] = x[pad + i];
}

function removeHum(x, sr, base) {
  for (let k = 1; k <= HUM_HARMONICS && base * k < sr * 0.45; k++) notch(x, sr, base * k);
}

function frames(x, each) {
  const re = new Float64Array(FRAME);
  const im = new Float64Array(FRAME);
  for (let start = -FRAME + HOP; start < x.length; start += HOP) {
    for (let i = 0; i < FRAME; i++) {
      const j = start + i;
      re[i] = j >= 0 && j < x.length ? x[j] * HANN[i] : 0;
      im[i] = 0;
    }
    fft(re, im);
    each(start, re, im);
  }
}

// Where the sound rises out of the background: the first moment clearly louder than the clip's
// noise floor. Measuring against the floor, not the peak, still works when a recording is noisy.
function leadEndMs(x, sr) {
  const size = Math.max(1, Math.round((LEVEL_WINDOW_MS / 1000) * sr));
  const levels = [];
  for (let i = 0; i + size <= x.length; i += size) {
    let sum = 0;
    for (let j = i; j < i + size; j++) sum += x[j] * x[j];
    levels.push(sum / size);
  }
  if (!levels.length) return 0;
  const floor = [...levels].sort((a, b) => a - b)[Math.floor(levels.length * FLOOR_PERCENTILE)];
  const first = levels.findIndex((v) => v > floor * ABOVE_FLOOR * ABOVE_FLOOR);
  return first < 0 ? 0 : Math.max(0, first * LEVEL_WINDOW_MS - NOISE_LEAD_GAP_MS);
}

// The noise to remove, as an average magnitude per frequency. It comes from the quiet part before the
// sound starts; a clip that starts right away uses its quietest moments instead.
export function noiseProfile(sample, x) {
  const leadMs = leadEndMs(x, sample.sampleRate);
  const leadEnd = Math.floor((leadMs / 1000) * sample.sampleRate);
  const bins = FRAME / 2 + 1;
  const spectra = [];
  frames(x, (start, re, im) => {
    const mag = new Float64Array(bins);
    let energy = 0;
    for (let k = 0; k < bins; k++) {
      mag[k] = Math.hypot(re[k], im[k]);
      energy += mag[k] * mag[k];
    }
    spectra.push({ start, mag, energy });
  });
  let picked = spectra.filter((f) => f.start >= 0 && f.start + FRAME <= leadEnd);
  const fromLead = picked.length >= MIN_NOISE_FRAMES;
  if (!fromLead) {
    const sorted = [...spectra].sort((a, b) => a.energy - b.energy);
    picked = sorted.slice(0, Math.max(MIN_NOISE_FRAMES, Math.ceil(sorted.length * QUIET_SHARE)));
  }
  const profile = new Float64Array(bins);
  for (const f of picked) for (let k = 0; k < bins; k++) profile[k] += f.mag[k] / picked.length;
  return { profile, leadMs: fromLead ? leadMs : 0 };
}

// How much quiet lead-in the noise is learned from, or 0 when the clip has too little and the quietest
// moments are used instead.
export function noiseLeadMs(sample) {
  const lead = leadEndMs(sample.channels[0], sample.sampleRate);
  const needed = ((FRAME + (MIN_NOISE_FRAMES - 1) * HOP) / sample.sampleRate) * 1000;
  return lead >= needed ? lead : 0;
}

// Spectral subtraction with a floor, smoothed across frequency and over time so the leftover hiss
// stays even instead of turning into chirps.
function denoise(x, profile, strength) {
  const n = x.length;
  const bins = FRAME / 2 + 1;
  const over = 1 + MAX_OVERSUBTRACT * strength;
  const floor = Math.pow(10, (-MAX_REDUCTION_DB * strength) / 20);
  const out = new Float64Array(n + FRAME);
  const norm = new Float64Array(n + FRAME);
  const raw = new Float64Array(bins);
  const gain = new Float64Array(bins).fill(1);
  frames(x, (start, re, im) => {
    for (let k = 0; k < bins; k++) {
      const mag = Math.hypot(re[k], im[k]);
      raw[k] = Math.max(floor, mag > 0 ? 1 - (over * profile[k]) / mag : 0);
    }
    for (let k = 0; k < bins; k++) {
      const smooth = (raw[Math.max(0, k - 1)] + 2 * raw[k] + raw[Math.min(bins - 1, k + 1)]) / 4;
      gain[k] = smooth >= gain[k] ? smooth : gain[k] * RELEASE + smooth * (1 - RELEASE);
      re[k] *= gain[k];
      im[k] *= gain[k];
      if (k > 0 && k < FRAME / 2) {
        re[FRAME - k] *= gain[k];
        im[FRAME - k] *= gain[k];
      }
    }
    // Inverse FFT through the forward one: conjugate, transform, conjugate, scale.
    for (let i = 0; i < FRAME; i++) im[i] = -im[i];
    fft(re, im);
    for (let i = 0; i < FRAME; i++) {
      const j = start + i;
      if (j < 0) continue;
      out[j] += (re[i] / FRAME) * HANN[i];
      norm[j] += HANN[i] * HANN[i];
    }
  });
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) y[i] = norm[i] > 1e-6 ? out[i] / norm[i] : 0;
  return y;
}

// Silences what is quieter than the threshold, measured below the clip's peak. It opens fast and
// closes slowly, so taps keep their tails.
function gate(chs, sr, thresholdDb) {
  const n = chs[0].length;
  let peak = 0;
  for (const c of chs) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(c[i]));
  if (!peak) return;
  const thr = peak * Math.pow(10, thresholdDb / 20);
  const attack = 1 - Math.exp(-1 / ((GATE_ATTACK_MS / 1000) * sr));
  const release = 1 - Math.exp(-1 / ((GATE_RELEASE_MS / 1000) * sr));
  const hold = Math.round((GATE_HOLD_MS / 1000) * sr);
  let env = 0;
  let g = 0;
  let held = 0;
  for (let i = 0; i < n; i++) {
    let a = 0;
    for (const c of chs) a = Math.max(a, Math.abs(c[i]));
    env = Math.max(a, env * (1 - release));
    if (env > thr) held = hold;
    else if (held > 0) held -= 1;
    const target = env > thr || held > 0 ? 1 : 0;
    g += (target - g) * (target > g ? attack : release);
    for (const c of chs) c[i] *= g;
  }
}

export function cleanChannels(sample, { denoise: strength = 0, gate: gateDb = GATE_OFF_DB, hum = 0 }) {
  const chs = sample.channels.map((c) => new Float32Array(c));
  if (hum > 0) for (const c of chs) removeHum(c, sample.sampleRate, hum);
  const out = strength > 0 ? chs.map((c) => denoise(c, noiseProfile(sample, c).profile, strength)) : chs;
  if (gateDb > GATE_OFF_DB) gate(out, sample.sampleRate, gateDb);
  return out;
}

// Cleaned copies, keyed by the clip and its settings, and dropped oldest-first. Renders and exports
// look audio up here before the stored clips, so a cleaned layer plays its cleaned copy everywhere.
const cleaned = new Map();
const keyFor = (L) => `${L.sampleId}~n${L.denoise.toFixed(2)}g${L.gate.toFixed(1)}h${L.hum}`;

export const lookupSample = (id) => cleaned.get(id) || samples.get(id);
export const sampleSource = { get: lookupSample };

function cleanedId(L) {
  const key = keyFor(L);
  if (!cleaned.has(key)) {
    const s = samples.get(L.sampleId);
    if (!s) return L.sampleId;
    cleaned.set(key, { id: key, name: s.name, sampleRate: s.sampleRate, channels: cleanChannels(s, L) });
    if (cleaned.size > CACHE_SIZE) cleaned.delete(cleaned.keys().next().value);
  }
  return key;
}

// The patch with every cleaned layer pointing at its cleaned copy. Layers without clean up are kept as is.
export function withCleanup(patch) {
  if (!patch.layers.some(isCleaned)) return patch;
  return { ...patch, layers: patch.layers.map((L) => (isCleaned(L) ? { ...L, sampleId: cleanedId(L) } : L)) };
}
