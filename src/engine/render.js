import { dbToGain, buildLayer, sampleRates, scheduleSound, slideDuration } from './engine.js';
import { sampleSource, withCleanup } from './cleanup.js';
import { fft } from './fft.js';
import { samples, sampleDurationMs } from './samples.js';

const MAX_RENDER_S = 6;
export const MAX_RENDER_MS = MAX_RENDER_S * 1000;
const TAIL_THRESHOLD = 0.001; // -60 dB below peak: where the file is trimmed
const AUDIBLE_THRESHOLD = 0.01; // -40 dB below peak: what counts as audible

export function sampleClipMs(L) {
  const s = samples.get(L.sampleId);
  if (!s) return 20;
  const { r0, r1, g } = sampleRates(L);
  return slideDuration(Math.max(1, sampleDurationMs(s) - L.trimStart - L.trimEnd) / 1000, r0, r1, g) * 1000;
}

export function clipMs(L) {
  if (L.type === 'sample') return [L.start, L.start + sampleClipMs(L)];
  if (L.type === 'modal') return [L.start, L.start + L.attack + L.decay];
  return [L.start, L.start + L.attack + L.hold + L.decay];
}

// How long each effect can ring past its layer, from its delay lines and feedback.
const FX_TAIL_MS = { chorus: 30, flanger: 120, phaser: 60 };

export function estimateLength(patch) {
  let end = 10;
  for (const L of patch.layers) {
    if (!L.on) continue;
    const tail = Math.max(0, ...(L.fx || []).filter((f) => f.on).map((f) => FX_TAIL_MS[f.type] || 0));
    end = Math.max(end, clipMs(L)[1] + tail);
  }
  const M = patch.master;
  let tail = 0;
  if (M.reverbMix > 0) tail += M.reverbSize * 1000 + M.reverbPredelay;
  if (M.delayMix > 0) {
    const fb = Math.min(0.95, Math.max(0.01, M.delayFeedback));
    const repeats = Math.min(16, Math.ceil(Math.log(0.001) / Math.log(fb)));
    tail = Math.max(tail, M.delayTime * (repeats + 1));
  }
  return Math.min(MAX_RENDER_S, (end + tail + 40) / 1000);
}

function spectrumOf(data, sr) {
  let N = 4096;
  while (N < data.length && N < 65536) N <<= 1;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const L = Math.min(data.length, N);
  for (let i = 0; i < L; i++) re[i] = data[i] * (L > 1 ? 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (L - 1)) : 1);
  fft(re, im);
  const mag = new Float32Array(N / 2);
  let max = 0;
  for (let k = 0; k < N / 2; k++) {
    mag[k] = Math.hypot(re[k], im[k]);
    if (mag[k] > max) max = mag[k];
  }
  return { mag, max, binHz: sr / N };
}

function emptyResult(sr) {
  const z = new Float32Array(1);
  return {
    channels: [z, z],
    mono: z,
    sr,
    gain: 0,
    duration: 1 / sr,
    spectrum: { mag: new Float32Array(2), max: 0, binHz: sr / 4 },
    m: { peakDb: -Infinity, rmsDb: -Infinity, audibleMs: 0, onsetMs: 0, centroid: 0, lowShare: 0 },
  };
}

function measure(res) {
  const { channels, sr, spectrum } = res;
  const n = channels[0].length;
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.max(Math.abs(channels[0][i]), Math.abs(channels[1][i]));
    if (a > peak) peak = a;
    sum += (channels[0][i] * channels[0][i] + channels[1][i] * channels[1][i]) / 2;
  }
  const thr = peak * AUDIBLE_THRESHOLD;
  let first = -1;
  let last = -1;
  for (let i = 0; i < n; i++) {
    if (Math.max(Math.abs(channels[0][i]), Math.abs(channels[1][i])) > thr) {
      if (first < 0) first = i;
      last = i;
    }
  }
  let num = 0;
  let den = 0;
  let low = 0;
  let tot = 0;
  for (let k = 1; k < spectrum.mag.length; k++) {
    const f = k * spectrum.binHz;
    if (f < 20 || f > 20000) continue;
    const m = spectrum.mag[k];
    num += f * m;
    den += m;
    tot += m * m;
    if (f < 250) low += m * m;
  }
  return {
    peakDb: 20 * Math.log10(peak || 1e-9),
    rmsDb: 10 * Math.log10(sum / n || 1e-12),
    audibleMs: first < 0 ? 0 : ((last - first) / sr) * 1000,
    onsetMs: first < 0 ? 0 : (first / sr) * 1000,
    centroid: den ? num / den : 0,
    lowShare: tot ? low / tot : 0,
  };
}

// Trims the silent tail, normalizes to the target peak and applies the end fade.
function finalize(chs, sr, M) {
  const n0 = chs[0].length;
  let peak = 0;
  // Comparisons skip NaN, and the finite check skips Infinity, so one bad sample can't silence the sound.
  for (const d of chs)
    for (let i = 0; i < n0; i++) {
      const a = Math.abs(d[i]);
      if (a > peak && a !== Infinity) peak = a;
    }
  if (peak < 1e-7) return emptyResult(sr);
  const thr = peak * TAIL_THRESHOLD;
  let end = n0 - 1;
  while (end > 0 && Math.abs(chs[0][end]) < thr && Math.abs(chs[1][end]) < thr) end -= 1;
  const n = end + 1;
  const gain = dbToGain(M.out) / peak;
  const channels = chs.map((d) => {
    const o = new Float32Array(n);
    for (let i = 0; i < n; i++) o[i] = Number.isFinite(d[i]) ? d[i] * gain : 0;
    return o;
  });
  const fadeN = Math.min(n, Math.round((sr * M.fade) / 1000));
  for (const o of channels) for (let i = 0; i < fadeN; i++) o[n - 1 - i] *= i / fadeN;
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = (channels[0][i] + channels[1][i]) / 2;
  const res = { channels, mono, sr, gain, duration: n / sr };
  res.spectrum = spectrumOf(mono, sr);
  res.m = measure(res);
  return res;
}

async function renderRaw(patch, sr) {
  const len = Math.max(64, Math.ceil(estimateLength(patch) * sr));
  const oc = new OfflineAudioContext(2, len, sr);
  scheduleSound(oc, patch, 0, oc.destination, { samples: sampleSource });
  const buf = await oc.startRendering();
  return [buf.getChannelData(0), buf.getChannelData(1)];
}

// The limiter works against the sound's own peak, which a first pass without it measures. Exported
// code carries that peak (res.limitRef), so it limits the same way.
async function withLimitRef(patch, sr) {
  if (!(patch.master.limit > 0)) return patch;
  let peak = 0;
  for (const d of await renderRaw({ ...patch, master: { ...patch.master, limit: 0 } }, sr))
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > peak && a !== Infinity) peak = a;
    }
  return { ...patch, master: { ...patch.master, limitRef: peak || 1 } };
}

export async function renderPatch(patch, sr) {
  const p = await withLimitRef(withCleanup(patch), sr);
  const res = finalize(await renderRaw(p, sr), sr, p.master);
  if (p.master.limitRef) res.limitRef = p.master.limitRef;
  return res;
}

export async function renderLayerAlone(L, sr, len) {
  const oc = new OfflineAudioContext(2, len, sr);
  const input = oc.createGain();
  input.connect(oc.destination);
  buildLayer(oc, { input, reverb: null, delay: null }, { ...L, on: true }, L.start / 1000, { samples: sampleSource });
  const b = await oc.startRendering();
  const a = b.getChannelData(0);
  const c = b.getChannelData(1);
  const data = new Float32Array(a.length);
  let peak = 0;
  for (let i = 0; i < a.length; i++) {
    data[i] = (a[i] + c[i]) / 2;
    peak = Math.max(peak, Math.abs(a[i]), Math.abs(c[i]));
  }
  return { data, peak };
}

export async function renderWithLayers(patch, sr) {
  const res = await renderPatch(patch, sr);
  const len = Math.max(64, Math.ceil(estimateLength(patch) * sr));
  res.layers = new Map();
  for (const L of withCleanup(patch).layers) res.layers.set(L.id, await renderLayerAlone(L, sr, len));
  return res;
}
