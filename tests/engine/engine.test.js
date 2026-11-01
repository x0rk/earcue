import { describe, expect, it } from 'vitest';
import { driveCurve, mulberry32, sampleRates, slideDuration, varyPatch } from '../../src/engine/engine.js';
import { layerDefaults, masterDefaults } from '../../src/engine/model.js';

// Plays len seconds of audio in tiny steps, as a check on slideDuration's closed form.
function stepThroughSlide(len, r0, r1, g, dt = 1e-6) {
  let pos = 0;
  let t = 0;
  while (pos < len) {
    const mid = t + dt / 2;
    pos += (g > 0 && mid < g ? r0 * (r1 / r0) ** (mid / g) : r1) * dt;
    t += dt;
  }
  return t;
}

describe('slideDuration', () => {
  it('divides by the rate when nothing slides', () => {
    expect(slideDuration(0.4, 1, 1, 0)).toBe(0.4);
    expect(slideDuration(0.4, 2, 2, 0.1)).toBe(0.2);
    expect(slideDuration(0.4, 0.5, 2, 0)).toBe(0.8);
  });

  it('times 0.4 s sliding from rate 1 to 2 over 0.1 s', () => {
    expect(slideDuration(0.4, 1, 2, 0.1)).toBeCloseTo(0.22787, 5);
  });

  it.each([
    ['up, finishing inside the clip', 0.4, 1, 2, 0.1],
    ['down, finishing inside the clip', 0.4, 2, 1, 0.1],
    ['up, with a glide longer than the clip', 0.1, 1, 2, 1],
    ['down, with a glide longer than the clip', 0.1, 1, 0.5, 1],
  ])('matches step-by-step playback sliding %s', (_, len, r0, r1, g) => {
    const t = slideDuration(len, r0, r1, g);
    expect(t).toBeCloseTo(stepThroughSlide(len, r0, r1, g), 5);
    expect(t).toBeGreaterThan(len / Math.max(r0, r1));
    expect(t).toBeLessThan(len / Math.min(r0, r1));
  });
});

describe('sampleRates', () => {
  const clip = (over) => ({ ...layerDefaults('sample'), ...over });

  it('turns semitones into playback rates', () => {
    expect(sampleRates(clip({ pitch: 12 }))).toEqual({ r0: 2, r1: 2, g: 0 });
    expect(sampleRates(clip({ pitch: -12 }))).toEqual({ r0: 0.5, r1: 0.5, g: 0 });
  });

  it('slides only with a glide time and a different target', () => {
    expect(sampleRates(clip({ pitch: 0, slideTo: 12, glide: 100 }))).toEqual({ r0: 1, r1: 2, g: 0.1 });
    expect(sampleRates(clip({ pitch: 0, slideTo: 12, glide: 0 }))).toEqual({ r0: 1, r1: 1, g: 0 });
    expect(sampleRates(clip({ pitch: 5, slideTo: 5, glide: 100 }))).toMatchObject({ g: 0 });
  });
});

describe('varyPatch', () => {
  const patch = {
    id: 'p',
    name: 'Mixed',
    seed: 1,
    master: masterDefaults(),
    layers: [
      { ...layerDefaults('tone'), pitchStart: 440, pitchEnd: 880, glide: 20 },
      { ...layerDefaults('modal'), freq: 1000 },
      { ...layerDefaults('sample'), pitch: 2, slideTo: -3, glide: 50 },
      layerDefaults('noise'),
    ],
  };

  it('returns the same patch for zero cents', () => {
    expect(varyPatch(patch, 0)).toBe(patch);
  });

  it('shifts tone, object and audio pitch by the same interval', () => {
    const before = structuredClone(patch);
    const [tone, modal, sample, noise] = varyPatch(patch, 100).layers;
    const semitone = 2 ** (1 / 12);
    expect(tone.pitchStart).toBeCloseTo(440 * semitone, 9);
    expect(tone.pitchEnd).toBeCloseTo(880 * semitone, 9);
    expect(modal.freq).toBeCloseTo(1000 * semitone, 9);
    expect(sample.pitch).toBe(3);
    expect(sample.slideTo).toBe(-2);
    expect(noise).toBe(patch.layers[3]);
    expect(patch).toEqual(before);
  });

  it('shifts down for negative cents', () => {
    const [tone, , sample] = varyPatch(patch, -1200).layers;
    expect(tone.pitchStart).toBeCloseTo(220, 9);
    expect(sample.pitch).toBe(-10);
    expect(sample.slideTo).toBe(-15);
  });
});

describe('mulberry32', () => {
  const take = (next, n) => Array.from({ length: n }, () => next());

  it('repeats the same sequence for the same seed', () => {
    expect(take(mulberry32(1234), 100)).toEqual(take(mulberry32(1234), 100));
  });

  // Noise layers and reverbs are seeded, so a change here would change every saved sound.
  it('keeps producing the numbers saved sounds were made with', () => {
    expect(take(mulberry32(42), 3)).toEqual([0.6011037519201636, 0.44829055899754167, 0.8524657934904099]);
  });

  it('gives different seeds different sequences, all in [0, 1)', () => {
    const a = take(mulberry32(1), 1000);
    expect(a).not.toEqual(take(mulberry32(2), 1000));
    expect(Math.min(...a)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...a)).toBeLessThan(1);
  });

  it('treats seeds as unsigned 32-bit integers', () => {
    expect(mulberry32(-1)()).toBe(mulberry32(0xffffffff)());
    expect(mulberry32(2 ** 32 + 7)()).toBe(mulberry32(7)());
  });
});

describe('driveCurve', () => {
  it.each([0, 0.25, 0.5, 1])('is bounded and monotonic at drive %s', (amount) => {
    const curve = driveCurve(amount);
    expect(curve).toHaveLength(2048);
    expect(curve[0]).toBe(-1);
    expect(curve[curve.length - 1]).toBe(1);
    expect(Math.min(...curve)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...curve)).toBeLessThanOrEqual(1);
    expect(curve.findIndex((v, i) => i > 0 && v < curve[i - 1])).toBe(-1);
  });

  it('bends harder with more drive', () => {
    const inputHalf = Math.round(0.75 * 2047);
    expect(driveCurve(1)[inputHalf]).toBeGreaterThan(driveCurve(0.5)[inputHalf]);
    expect(driveCurve(0.5)[inputHalf]).toBeGreaterThan(driveCurve(0)[inputHalf]);
  });
});
