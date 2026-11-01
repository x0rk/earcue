import { OfflineAudioContext } from 'node-web-audio-api';
import { beforeAll, describe, expect, it } from 'vitest';
import { seedRandom } from '../helpers.js';

globalThis.OfflineAudioContext = OfflineAudioContext;
seedRandom();
const { cleanChannels, isCleaned, lookupSample, noiseLeadMs, withCleanup } = await import('../../src/engine/cleanup.js');
const { renderPatch } = await import('../../src/engine/render.js');
const { moduleSource } = await import('../../src/engine/export.js');
const { blankPatch, layerDefaults, normalizeLayer } = await import('../../src/engine/model.js');
const { samples } = await import('../../src/engine/samples.js');

const SR = 48000;
const LEAD_S = 0.3;

// A desk tap recorded in a noisy room: steady hiss, 50 Hz mains hum, and two taps at 0.3 s and 0.8 s.
function dirtyClip() {
  const n = Math.round(1.2 * SR);
  const x = new Float32Array(n);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < n; i++) x[i] = 0.01 * rnd() + 0.03 * Math.sin((2 * Math.PI * 50 * i) / SR);
  for (const t0 of [LEAD_S, 0.8])
    for (let i = Math.round(t0 * SR); i < Math.min(n, Math.round((t0 + 0.25) * SR)); i++) {
      const t = i / SR - t0;
      x[i] += 0.7 * Math.exp(-t / 0.04) * Math.sin(2 * Math.PI * 700 * t);
    }
  return { id: 'dirty', name: 'Desk tap.wav', sampleRate: SR, channels: [x] };
}

const rmsDb = (x, a, b) => {
  let s = 0;
  for (let i = Math.round(a * SR); i < Math.round(b * SR); i++) s += x[i] * x[i];
  return 10 * Math.log10(s / (Math.round(b * SR) - Math.round(a * SR)) + 1e-20);
};
const toneDb = (x, hz, a, b) => {
  let re = 0;
  let im = 0;
  const i0 = Math.round(a * SR);
  const i1 = Math.round(b * SR);
  for (let i = i0; i < i1; i++) {
    re += x[i] * Math.cos((2 * Math.PI * hz * i) / SR);
    im += x[i] * Math.sin((2 * Math.PI * hz * i) / SR);
  }
  return 20 * Math.log10((2 * Math.hypot(re, im)) / (i1 - i0) + 1e-12);
};
const peakDb = (x, a, b) => {
  let p = 0;
  for (let i = Math.round(a * SR); i < Math.round(b * SR); i++) p = Math.max(p, Math.abs(x[i]));
  return 20 * Math.log10(p);
};

describe('cleanChannels', () => {
  const clip = dirtyClip();
  const original = clip.channels[0].slice();

  it('finds the quiet lead-in before the sound', () => {
    expect(noiseLeadMs(clip)).toBeGreaterThan(LEAD_S * 1000 - 20);
    expect(noiseLeadMs(clip)).toBeLessThanOrEqual(LEAD_S * 1000);
  });

  it('removes mains hum', () => {
    const [x] = cleanChannels(clip, { hum: 50 });
    expect(toneDb(original, 50, 0.05, 0.28) - toneDb(x, 50, 0.05, 0.28)).toBeGreaterThan(25);
  });

  it('removes steady noise and keeps the tap', () => {
    const [x] = cleanChannels(clip, { denoise: 1 });
    expect(rmsDb(original, 0.05, 0.28) - rmsDb(x, 0.05, 0.28)).toBeGreaterThan(20);
    expect(Math.abs(peakDb(x, 0.3, 0.4) - peakDb(original, 0.3, 0.4))).toBeLessThan(1);
    expect(Math.abs(toneDb(x, 700, 0.3, 0.36) - toneDb(original, 700, 0.3, 0.36))).toBeLessThan(1);
  });

  it('gates the gaps between taps', () => {
    const [x] = cleanChannels(clip, { hum: 50, denoise: 1, gate: -40 });
    expect(rmsDb(x, 0.62, 0.78)).toBeLessThan(-70);
  });

  it('leaves the original clip untouched', () => {
    cleanChannels(clip, { hum: 60, denoise: 0.5, gate: -30 });
    expect(clip.channels[0]).toEqual(original);
  });
});

describe('withCleanup', () => {
  const clip = dirtyClip();
  const layer = (over) => ({ ...layerDefaults('sample'), sampleId: clip.id, ...over });
  beforeAll(() => samples.set(clip.id, clip));

  it('keeps a patch without clean up as it is', () => {
    const patch = { ...blankPatch('Plain'), layers: [layer()] };
    expect(isCleaned(patch.layers[0])).toBe(false);
    expect(withCleanup(patch)).toBe(patch);
  });

  it('points a cleaned layer at its cleaned copy', () => {
    const patch = { ...blankPatch('Clean'), layers: [layer({ denoise: 0.8 })] };
    const cleaned = withCleanup(patch).layers[0];
    expect(cleaned.sampleId).not.toBe(clip.id);
    expect(lookupSample(cleaned.sampleId).channels[0]).not.toEqual(clip.channels[0]);
    expect(lookupSample(clip.id)).toBe(clip);
  });

  it('renders cleaned audio and ships only that in code exports', async () => {
    const patch = { ...blankPatch('Clean'), layers: [layer({ denoise: 1, hum: 50, gate: -40 })] };
    const res = await renderPatch(patch, SR);
    expect(res.m.peakDb).toBeCloseTo(patch.master.out, 1);
    const src = moduleSource(patch, res);
    expect(src).toContain(`"${withCleanup(patch).layers[0].sampleId}"`);
    expect(src).not.toContain(`"${clip.id}"`);
  });
});

describe('clean up settings', () => {
  it('are clamped and checked when loaded', () => {
    const L = normalizeLayer({ ...layerDefaults('sample'), denoise: 5, gate: 10, hum: 55 });
    expect(L.denoise).toBe(1);
    expect(L.gate).toBe(-20);
    expect(L.hum).toBe(0);
  });
});
