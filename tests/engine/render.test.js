import { OfflineAudioContext } from 'node-web-audio-api';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { importSource, seedRandom } from '../helpers.js';

// render.js renders with the browser's OfflineAudioContext. node-web-audio-api brings the Web Audio API
// to Node, so the app's real graphs render here too.
globalThis.OfflineAudioContext = OfflineAudioContext;
seedRandom();
const { clipMs, estimateLength, renderLayerAlone, renderPatch } = await import('../../src/engine/render.js');
const { moduleSource, readPatchFile } = await import('../../src/engine/export.js');
const { blankPatch, layerDefaults, starterSounds } = await import('../../src/engine/model.js');
const { floatToB64, samples } = await import('../../src/engine/samples.js');
const { ROLES, soundsForRole } = await import('../../src/engine/roles.js');

const SR = 48000;
// A centered mono layer reaches each channel at -3 dB, because panning is equal-power.
const CENTER_GAIN = Math.SQRT1_2;

// The longest each starter sound may ring: what the set checks allow for the interaction it plays,
// less a margin so a small edit doesn't tip it over. Frequent sounds stay short; alerts can ring on.
const BUDGET_MS = { frequent: 100, confirm: 250, alert: 500 };
const MARGIN = 0.9;

describe('starter sounds', () => {
  const sounds = starterSounds();
  const renders = new Map();
  beforeAll(async () => {
    for (const p of sounds) renders.set(p.name, await renderPatch(p, SR));
  });

  describe.each(sounds.map((p) => [p.name, p]))('%s', (name, patch) => {
    it('peaks at its output level', () => {
      expect(Math.abs(renders.get(name).m.peakDb - patch.master.out)).toBeLessThan(0.2);
    });

    it('starts within 5 ms', () => {
      expect(renders.get(name).m.onsetMs).toBeLessThan(5);
    });

    it('keeps under 1% of its energy below 250 Hz', () => {
      expect(renders.get(name).m.lowShare).toBeLessThan(0.01);
    });

    it('is no longer than its role allows', () => {
      const role = ROLES.find((r) => soundsForRole({ sounds, roles: {} }, r.id).includes(patch));
      expect(role, 'plays for an interaction').toBeTruthy();
      expect(renders.get(name).m.audibleMs).toBeLessThan((role.maxMs || BUDGET_MS[role.tier]) * MARGIN);
    });
  });
});

describe('audio layers', () => {
  const RAMP = 'test-ramp';
  const RAMP_MS = 300;
  const ramp = (at) => 0.1 + 0.8 * at;

  // A rising ramp that never reaches zero shows which part of the clip plays at each moment.
  beforeAll(() => {
    const n = (RAMP_MS / 1000) * SR;
    samples.set(RAMP, { id: RAMP, name: 'Ramp', sampleRate: SR, channels: [Float32Array.from({ length: n }, (_, i) => ramp(i / n))] });
  });
  afterAll(() => samples.delete(RAMP));

  const layer = (over) => ({ ...layerDefaults('sample'), sampleId: RAMP, start: 10, ...over });

  // The first and last frames where the layer can be heard.
  async function heard(L) {
    const { data } = await renderLayerAlone(L, SR, SR);
    let first = -1;
    let last = -1;
    data.forEach((v, i) => {
      if (Math.abs(v) > 1e-6) {
        if (first < 0) first = i;
        last = i;
      }
    });
    return { data, first, last };
  }

  it.each([
    ['trimmed', { trimStart: 20, trimEnd: 30, fadeOut: 0 }],
    ['pitched up', { pitch: 7, fadeOut: 0 }],
    ['sliding up', { slideTo: 12, glide: 100, fadeOut: 0 }],
    ['sliding down', { pitch: 5, slideTo: -7, glide: 80, fadeOut: 0 }],
    ['gliding for longer than the clip lasts', { slideTo: 12, glide: 400, fadeOut: 0 }],
    ['faded in and out', { fadeIn: 15, fadeOut: 60, trimStart: 10, trimEnd: 10 }],
    ['faded while sliding', { fadeIn: 15, fadeOut: 60, pitch: -3, slideTo: 9, glide: 120 }],
  ])('plays for the span clipMs() gives when %s', async (_, over) => {
    const L = layer(over);
    const [from, to] = clipMs(L);
    const { first, last } = await heard(L);
    expect(Math.abs((first / SR) * 1000 - from)).toBeLessThan(2);
    expect(Math.abs(((last + 1) / SR) * 1000 - to)).toBeLessThan(2);
  });

  it.each([
    ['forward', false, 20 / RAMP_MS, 1 - 30 / RAMP_MS],
    ['reversed', true, 1 - 20 / RAMP_MS, 30 / RAMP_MS],
  ])('plays exactly the trimmed part of the clip, %s', async (_, reverse, startsAt, endsAt) => {
    const { data, first, last } = await heard(layer({ trimStart: 20, trimEnd: 30, reverse, fadeOut: 0 }));
    expect(data[first] / CENTER_GAIN).toBeCloseTo(ramp(startsAt), 3);
    expect(data[last] / CENTER_GAIN).toBeCloseTo(ramp(endsAt), 3);
  });
});

// Signal-to-noise ratio, in dB, of a render against a reference, over the reference's frames.
function snrDb(reference, other) {
  let signal = 0;
  let noise = 0;
  reference.forEach((ch, c) => {
    for (let i = 0; i < ch.length; i++) {
      signal += ch[i] ** 2;
      noise += (ch[i] - other[c][i]) ** 2;
    }
  });
  return 10 * Math.log10(signal / noise);
}

// Renders an exported module the way an app plays it: playSound(ctx, ctx.destination, 0).
async function renderExport(patch, res) {
  const { playSound } = await importSource(moduleSource(patch, res));
  const ctx = new OfflineAudioContext(2, Math.ceil(estimateLength(patch) * SR), SR);
  // playSound disconnects its output on a timer once real-time playback would be over. An offline
  // render is done long before that, so the timer is dropped instead of firing into a finished context.
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  try {
    playSound(ctx, ctx.destination, 0);
  } finally {
    vi.useRealTimers();
  }
  const buf = await ctx.startRendering();
  return [buf.getChannelData(0), buf.getChannelData(1)];
}

describe('exported module', () => {
  it('renders the same audio as the app', async () => {
    const send = starterSounds().find((p) => p.name === 'Send');
    expect(send.master.variation).toBe(0);
    const res = await renderPatch(send, SR);
    expect(snrDb(res.channels, await renderExport(send, res))).toBeGreaterThan(60);
  });

  describe('with a trimmed audio layer', () => {
    const CLIP = 'test-tones';
    beforeAll(() => {
      const tones = Float32Array.from({ length: SR }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / SR) + 0.3 * Math.sin((2 * Math.PI * 1234.5 * i) / SR));
      samples.set(CLIP, { id: CLIP, name: 'Tones', sampleRate: SR, channels: [tones] });
    });
    afterAll(() => samples.delete(CLIP));

    it.each([
      ['forward', false],
      ['reversed', true],
    ])('renders the same audio played %s', async (_, reverse) => {
      const clip = { ...layerDefaults('sample'), sampleId: CLIP, trimStart: 250, trimEnd: 500, reverse, pitch: 3, slideTo: -2, glide: 60 };
      const patch = { ...blankPatch('Clip'), layers: [clip] };
      const res = await renderPatch(patch, SR);
      expect(snrDb(res.channels, await renderExport(patch, res))).toBeGreaterThan(60);
    });
  });
});

describe('imported audio', () => {
  afterEach(() => samples.delete('clip'));

  const project = (channels) =>
    JSON.stringify({
      format: 'earcue-project/1',
      patch: { name: 'Clip', layers: [{ ...layerDefaults('sample'), sampleId: 'clip' }] },
      samples: { clip: { name: 'Clip', sampleRate: SR, channels } },
    });
  const tone = (n) => floatToB64(Float32Array.from({ length: n }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 660 * i) / SR)));

  it('renders a project with audio in it', async () => {
    const patch = readPatchFile(project([tone(4800)]));
    expect((await renderPatch(patch, SR)).m.peakDb).toBeCloseTo(patch.master.out, 1);
  });

  it('renders a project whose audio has an empty channel', async () => {
    await expect(renderPatch(readPatchFile(project([''])), SR)).resolves.toBeDefined();
  });

  it('renders a project whose audio channels differ in length', async () => {
    await expect(renderPatch(readPatchFile(project([tone(100), tone(1000)])), SR)).resolves.toBeDefined();
  });
});
