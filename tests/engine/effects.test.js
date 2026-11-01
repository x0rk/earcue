import { OfflineAudioContext } from 'node-web-audio-api';
import { describe, expect, it, vi } from 'vitest';
import { importSource, seedRandom } from '../helpers.js';

globalThis.OfflineAudioContext = OfflineAudioContext;
seedRandom();
const { estimateLength, renderPatch } = await import('../../src/engine/render.js');
const { moduleSource } = await import('../../src/engine/export.js');
const { FX_TYPES, MAX_FX, fxDefaults, layerDefaults, normalizeLayer, normalizePatch, starterSounds } = await import('../../src/engine/model.js');

const SR = 48000;
// One Send for the whole file: each starterSounds() call picks new noise seeds, which would make two
// renders differ for reasons that have nothing to do with the effect under test.
const SEND = starterSounds().find((p) => p.name === 'Send');
const send = () => structuredClone(SEND);
const withFx = (patch, types) => ({ ...patch, layers: patch.layers.map((L) => ({ ...L, fx: types.map(fxDefaults) })) });
const crestDb = (res) => res.m.peakDb - res.m.rmsDb;

function snrDb(a, b) {
  let sig = 0;
  let err = 0;
  for (let c = 0; c < a.length; c++)
    for (let i = 0; i < a[c].length; i++) {
      sig += a[c][i] ** 2;
      err += (a[c][i] - (b[c][i] || 0)) ** 2;
    }
  return 10 * Math.log10(sig / (err || 1e-30));
}

async function renderExport(patch, res) {
  const { playSound } = await importSource(moduleSource(patch, res));
  const ctx = new OfflineAudioContext(2, Math.ceil(estimateLength(patch) * SR), SR);
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  try {
    playSound(ctx, ctx.destination, 0);
  } finally {
    vi.useRealTimers();
  }
  const buf = await ctx.startRendering();
  return [buf.getChannelData(0), buf.getChannelData(1)];
}

describe('effect settings', () => {
  it('keep known types only, up to the limit, clamped', () => {
    const fx = [{ type: 'constructor' }, { type: 'nope' }, { ...fxDefaults('crush'), bits: 99 }, ...Array.from({ length: 10 }, () => fxDefaults('eq'))];
    const L = normalizeLayer({ ...layerDefaults('tone'), fx });
    expect(L.fx).toHaveLength(MAX_FX - 2);
    expect(L.fx[0]).toMatchObject({ type: 'crush', bits: 16 });
  });

  it('reset an unknown reverb type', () => {
    expect(normalizePatch({ ...send(), master: { ...send().master, reverbType: 'cathedral' } }).master.reverbType).toBe('room');
  });
});

describe('each effect', () => {
  const dry = renderPatch(send(), SR);

  it.each(Object.keys(FX_TYPES))('%s renders on time at the target peak', async (type) => {
    const patch = withFx(send(), [type]);
    const res = await renderPatch(patch, SR);
    expect(res.m.onsetMs).toBeLessThan(5);
    expect(res.m.peakDb).toBeCloseTo(patch.master.out, 1);
    if (type !== 'eq') expect(snrDb([(await dry).mono], [res.mono])).toBeLessThan(40);
  });

  it('skips an effect that is turned off', async () => {
    const patch = withFx(send(), ['crush']);
    for (const L of patch.layers) L.fx[0].on = false;
    expect(snrDb([(await dry).mono], [(await renderPatch(patch, SR)).mono])).toBeGreaterThan(100);
  });
});

describe('reverb types', () => {
  const room = (type, reverse = false) => ({ ...send(), master: { ...send().master, reverbMix: 0.4, reverbSize: 0.6, reverbType: type, reverbReverse: reverse } });

  it.each(['room', 'hall', 'plate', 'spring'])('%s renders, and reversed it swells longer', async (type) => {
    const forward = await renderPatch(room(type), SR);
    const reversed = await renderPatch(room(type, true), SR);
    expect(forward.m.peakDb).toBeCloseTo(-20, 1);
    expect(reversed.m.audibleMs).toBeGreaterThan(forward.m.audibleMs);
  });
});

describe('limiter', () => {
  const limited = (limit) => ({ ...send(), master: { ...send().master, limit } });

  it('lowers the peak-to-average ratio without making the sound late', async () => {
    const off = await renderPatch(limited(0), SR);
    const on = await renderPatch(limited(12), SR);
    expect(crestDb(on)).toBeLessThan(crestDb(off) - 0.5);
    expect(on.m.onsetMs).toBeLessThan(5);
    expect(on.limitRef).toBeGreaterThan(0);
  });
});

describe('exported module', () => {
  it('plays effects, a spring room and the limiter like the app', async () => {
    const patch = { ...withFx(send(), Object.keys(FX_TYPES)), master: { ...send().master, limit: 6, reverbMix: 0.3, reverbType: 'spring' } };
    const res = await renderPatch(patch, SR);
    expect(moduleSource(patch, res)).toContain('"limitRef"');
    expect(snrDb(res.channels, await renderExport(patch, res))).toBeGreaterThan(60);
  });
});
