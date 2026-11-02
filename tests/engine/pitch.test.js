import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/engine/engine.js';
import { detectPitch, samplePitch } from '../../src/engine/pitch.js';
import { samples } from '../../src/engine/samples.js';

const SR = 48000;
const clip = (fn, { seconds = 0.3, sampleRate = SR } = {}) => {
  const d = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < d.length; i++) d[i] = fn(i / sampleRate, i);
  return { id: 'clip', name: 'clip', sampleRate, channels: [d] };
};
const sine = (hz, decay = 0) => (t) => 0.5 * Math.sin(2 * Math.PI * hz * t) * Math.exp(-decay * t);
const cents = (a, b) => Math.abs(1200 * Math.log2(a / b));

describe('detectPitch', () => {
  it.each([65, 110, 440, 1046.5, 1900])('finds a steady %d Hz tone', (hz) => {
    expect(cents(detectPitch(clip(sine(hz))), hz)).toBeLessThan(5);
  });

  it('finds the note of a tone rich in harmonics, not one of the harmonics', () => {
    const buzz = (t) => [1, 2, 3, 4, 5, 6, 7, 8].reduce((v, k) => v + (0.3 / k) * Math.sin(2 * Math.PI * 220 * k * t), 0);
    expect(cents(detectPitch(clip(buzz)), 220)).toBeLessThan(5);
  });

  it('finds a struck note that dies away fast, after the click of the hit', () => {
    const noise = mulberry32(7);
    const knock = (t) => (t < 0.003 ? noise() - 0.5 : 0) + sine(800, 30)(t);
    expect(cents(detectPitch(clip(knock)), 800)).toBeLessThan(5);
  });

  it('starts listening where the sound starts', () => {
    const late = (t) => (t < 0.1 ? 0 : sine(440)(t));
    expect(cents(detectPitch(clip(late, { seconds: 0.4 })), 440)).toBeLessThan(5);
  });

  it.each([44100, 96000])('works at %i Hz', (sampleRate) => {
    expect(cents(detectPitch(clip(sine(523.25), { sampleRate })), 523.25)).toBeLessThan(5);
  });

  it('gives no pitch for noise, silence or audio too short to repeat', () => {
    const noise = mulberry32(3);
    expect(detectPitch(clip(() => noise() - 0.5))).toBeNull();
    expect(detectPitch(clip(() => 0))).toBeNull();
    expect(detectPitch(clip(sine(440), { seconds: 0.012 }))).toBeNull();
  });
});

describe('samplePitch', () => {
  it('analyzes a stored sample once, and has no pitch for audio it does not have', () => {
    samples.set('tone-a', { ...clip(sine(440)), id: 'tone-a' });
    const hz = samplePitch('tone-a');
    expect(cents(hz, 440)).toBeLessThan(5);
    samples.delete('tone-a');
    expect(samplePitch('tone-a')).toBe(hz);
    expect(samplePitch('missing')).toBeNull();
    expect(samplePitch(null)).toBeNull();
  });
});
