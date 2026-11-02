import { detectOnsetMs, samples } from './samples.js';

// Finds the pitch of a recording, so a set can take its key from it and retune it with the rest.
// It uses the normalized square difference function from McLeod and Wyvill's MPM: the audio is
// compared with itself shifted by every possible period, and a clean repeat marks the pitch.
// Knocks, clicks and breath repeat poorly, so they get no pitch rather than a wrong one.
const MIN_HZ = 60;
const MAX_HZ = 2000;
// The first few milliseconds of a hit are mostly noise, so the window opens just after them.
const SKIP_MS = 8;
const WINDOW_MS = 120;
// Faster audio is averaged down to about this rate first, which is plenty for pitches up to MAX_HZ.
const ANALYSIS_RATE = 24000;
// How cleanly the audio has to repeat to count as pitched, from 0 to 1.
const CLARITY = 0.8;
// The shortest period that repeats nearly as well as the best one wins, so a strong low partial
// can't pull the answer down an octave.
const PEAK_PICK = 0.9;

export function detectPitch(sample, startMs = detectOnsetMs(sample)) {
  const d = sample.channels[0];
  const step = Math.max(1, Math.floor(sample.sampleRate / ANALYSIS_RATE));
  const sr = sample.sampleRate / step;
  const i0 = Math.round(((startMs + SKIP_MS) / 1000) * sample.sampleRate);
  const n = Math.min(Math.floor((d.length - i0) / step), Math.round((WINDOW_MS / 1000) * sr));
  const minLag = Math.max(2, Math.floor(sr / MAX_HZ));
  const maxLag = Math.min(Math.ceil(sr / MIN_HZ), Math.floor(n / 2));
  if (!(maxLag > minLag + 2)) return null;
  const x = new Float32Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let k = 0; k < step; k++) v += d[i0 + i * step + k];
    x[i] = v / step;
    mean += x[i];
  }
  mean /= n;
  for (let i = 0; i < n; i++) x[i] -= mean;
  const nsdf = new Float32Array(maxLag + 2);
  for (let tau = 0; tau < nsdf.length; tau++) {
    let acf = 0;
    let energy = 0;
    for (let i = 0; i + tau < n; i++) {
      acf += x[i] * x[i + tau];
      energy += x[i] * x[i] + x[i + tau] * x[i + tau];
    }
    nsdf[tau] = energy > 0 ? (2 * acf) / energy : 0;
  }
  // After the first dip below zero, the top of each stretch above zero is a candidate period.
  const peaks = [];
  let tau = 1;
  while (tau <= maxLag && nsdf[tau] > 0) tau++;
  for (;;) {
    while (tau <= maxLag && nsdf[tau] <= 0) tau++;
    if (tau > maxLag) break;
    let best = tau;
    for (; tau <= maxLag && nsdf[tau] > 0; tau++) if (nsdf[tau] > nsdf[best]) best = tau;
    if (best >= minLag) peaks.push(best);
  }
  if (!peaks.length) return null;
  const top = Math.max(...peaks.map((p) => nsdf[p]));
  if (top < CLARITY) return null;
  const p = peaks.find((q) => nsdf[q] >= PEAK_PICK * top);
  // A parabola through the peak and its neighbors places the period between samples.
  const [a, b, c] = [nsdf[p - 1], nsdf[p], nsdf[p + 1]];
  const den = a - 2 * b + c;
  const hz = sr / (p + (den ? (0.5 * (a - c)) / den : 0));
  return hz >= MIN_HZ && hz <= MAX_HZ ? hz : null;
}

const pitches = new Map();

// The pitch of a stored sample at its own speed, or null when it has none. A sample id always holds
// the same audio, so each is analyzed once.
export function samplePitch(id) {
  if (pitches.has(id)) return pitches.get(id);
  const s = id ? samples.get(id) : null;
  if (!s) return null;
  const hz = detectPitch(s);
  pitches.set(id, hz);
  return hz;
}
