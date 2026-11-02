import { describe, expect, it } from 'vitest';
import {
  cleanName,
  LAYER_TYPES,
  layerDefaults,
  masterDefaults,
  MAX_LAYERS,
  MAX_NAME,
  normalizeLayer,
  normalizePatch,
  oppositePatch,
  presets,
  starterSounds,
  uniqueName,
} from '../../src/engine/model.js';

const withoutRandom = ({ id, seed, ...rest }) => rest;

describe('normalizeLayer', () => {
  it('returns null for missing or unknown layer types', () => {
    for (const raw of [null, undefined, 'tone', {}, { type: 'granular' }, { type: 'Tone' }]) expect(normalizeLayer(raw)).toBeNull();
  });

  it.each(LAYER_TYPES)('fills a bare %s layer with its defaults', (type) => {
    expect(withoutRandom(normalizeLayer({ type }))).toEqual(withoutRandom(layerDefaults(type)));
  });

  it('clamps crafted numbers to the limits', () => {
    expect(
      normalizeLayer({ type: 'tone', voices: 500000, pitchStart: 1e9, pitchEnd: 1, detune: 999, start: 1e7, level: 99, pan: -7, decay: 0, glide: 1e5, fmIndex: 100 }),
    ).toMatchObject({ voices: 5, pitchStart: 12000, pitchEnd: 20, detune: 50, start: 6000, level: 6, pan: -1, decay: 2, glide: 400, fmIndex: 8 });
    expect(normalizeLayer({ type: 'sample', pitch: 99, slideTo: -99, fadeIn: 1e6, fadeOut: 1e9, trimStart: -1, trimEnd: 1e12 })).toMatchObject({
      pitch: 24,
      slideTo: -24,
      fadeIn: 300,
      fadeOut: 3000,
      trimStart: 0,
      trimEnd: 600000,
    });
    expect(normalizeLayer({ type: 'modal', partials: 99, freq: 1, strike: 10, damping: 2 })).toMatchObject({ partials: 5, freq: 40, strike: 0, damping: 1 });
    const { filter, lfo } = normalizeLayer({ type: 'noise', filter: { freq: 1e6, q: 0, envAmt: 40, envTime: 0 }, lfo: { rate: 1000, depth: -1 } });
    expect(filter).toMatchObject({ freq: 20000, q: 0.1, envAmt: 6, envTime: 1 });
    expect(lfo).toMatchObject({ rate: 80, depth: 0 });
  });

  it('rounds whole-number fields', () => {
    expect(normalizeLayer({ type: 'tone', voices: 2.6 }).voices).toBe(3);
    expect(normalizeLayer({ type: 'modal', partials: 3.4 }).partials).toBe(3);
    expect(normalizeLayer({ type: 'noise', seed: 12.5 }).seed).toBe(13);
    expect(normalizeLayer({ type: 'noise', seed: 2 ** 40 }).seed).toBe(0xffffffff);
  });

  it('replaces NaN, Infinity and values of the wrong type with defaults', () => {
    const defaults = layerDefaults('tone');
    const L = normalizeLayer({ type: 'tone', decay: NaN, attack: Infinity, level: -Infinity, voices: '5', on: 'yes', name: 42, wave: 7, filter: 'lowpass', lfo: [] });
    expect(L).toMatchObject({ decay: defaults.decay, attack: defaults.attack, level: defaults.level, voices: defaults.voices, on: true, name: 'Tone', wave: 'sine' });
    expect(L.filter).toEqual(defaults.filter);
    expect(L.lfo).toEqual(defaults.lfo);
  });

  it('falls back from unknown enum values', () => {
    expect(normalizeLayer({ type: 'tone', wave: 'triangle2' }).wave).toBe('sine');
    expect(normalizeLayer({ type: 'noise', color: 'blue' }).color).toBe('white');
    expect(normalizeLayer({ type: 'modal', material: 'plastic' }).material).toBe('bar');
    expect(normalizeLayer({ type: 'tone', filter: { type: 'notch' } }).filter.type).toBe('none');
    expect(normalizeLayer({ type: 'tone', lfo: { target: 'pan' } }).lfo.target).toBe('off');
  });

  it('cleans names, drops unknown keys and keeps only string ids', () => {
    const L = normalizeLayer({ type: 'sample', id: 'layer-1', sampleId: 42, name: `Kick\n${'x'.repeat(200)}`, extra: true });
    expect(L.id).toBe('layer-1');
    expect(L.sampleId).toBeNull();
    expect(L.name).toBe(`Kick ${'x'.repeat(115)}`);
    expect(L).not.toHaveProperty('extra');
    expect(normalizeLayer({ type: 'sample', sampleId: 's-1' }).sampleId).toBe('s-1');
    expect(normalizeLayer({ type: 'tone', id: 7 }).id).toEqual(expect.any(String));
  });
});

describe('normalizePatch', () => {
  it('returns null for anything without a layer list', () => {
    for (const raw of [null, undefined, 42, 'patch', [], {}, { layers: 'none' }]) expect(normalizePatch(raw)).toBeNull();
  });

  it('cleans the name and description', () => {
    expect(normalizePatch({ name: '  Ping pong\n', layers: [] }).name).toBe('Ping pong');
    expect(normalizePatch({ name: 'n'.repeat(100), layers: [] }).name).toHaveLength(MAX_NAME);
    expect(normalizePatch({ name: '\u0000\u001f', layers: [] }).name).toBe('Untitled');
    expect(normalizePatch({ name: 7, layers: [] }).name).toBe('Untitled');
    expect(normalizePatch({ description: 'd'.repeat(500), layers: [] }).description).toHaveLength(160);
  });

  it('keeps the seed an unsigned 32-bit integer', () => {
    expect(normalizePatch({ seed: -1, layers: [] }).seed).toBe(0xffffffff);
    expect(normalizePatch({ seed: 2 ** 32 + 5, layers: [] }).seed).toBe(5);
    expect(normalizePatch({ seed: NaN, layers: [] }).seed).toBe(0);
  });

  it('clamps the output settings and drops unknown ones', () => {
    const { master } = normalizePatch({
      layers: [],
      master: { out: 0, variation: 500, compRatio: 0, reverbSize: 100, delayFeedback: 1, hpf: 1, lpf: 1e6, fade: -3, compOn: 'yes', extra: 1 },
    });
    expect(master).toMatchObject({ out: -1, variation: 100, compRatio: 1, reverbSize: 3, delayFeedback: 0.9, hpf: 20, lpf: 20000, fade: 0, compOn: false });
    expect(Object.keys(master).sort()).toEqual(Object.keys(masterDefaults()).sort());
  });

  it('keeps the mark for a sound that clashes on purpose only when it is true', () => {
    expect(normalizePatch({ layers: [], tension: true }).tension).toBe(true);
    for (const tension of [false, 'yes', 1, null]) expect(normalizePatch({ layers: [], tension })).not.toHaveProperty('tension');
  });

  it('drops invalid layers and keeps at most MAX_LAYERS', () => {
    expect(normalizePatch({ layers: [{ type: 'tone' }, { type: 'bogus' }, null, 'noise'] }).layers).toHaveLength(1);
    const layers = Array.from({ length: MAX_LAYERS + 36 }, () => ({ type: 'noise' }));
    expect(normalizePatch({ layers }).layers).toHaveLength(MAX_LAYERS);
  });
});

describe('cleanName', () => {
  it.each([
    ['a line feed', '\n'],
    ['a carriage return', '\r'],
    ['a tab', '\t'],
    ['NUL', '\u0000'],
    ['DEL', '\u007f'],
    ['NEL', '\u0085'],
    ['a line separator', ' '],
    ['a paragraph separator', ' '],
  ])('turns %s into a space', (_, ch) => {
    expect(cleanName(`a${ch}b`, MAX_NAME)).toBe('a b');
  });

  it('trims and cuts to the max length', () => {
    expect(cleanName('  \n Tap \t', MAX_NAME)).toBe('Tap');
    expect(cleanName('x'.repeat(100), MAX_NAME)).toBe('x'.repeat(MAX_NAME));
  });

  it('never cuts a character in half', () => {
    expect(cleanName(`${'a'.repeat(MAX_NAME - 1)}\u{1F514}`, MAX_NAME).isWellFormed()).toBe(true);
  });
});

describe('uniqueName', () => {
  it('keeps a free name', () => {
    expect(uniqueName('Tone', ['Noise'])).toBe('Tone');
  });

  it('adds the first free number', () => {
    expect(uniqueName('Tone', ['Tone'])).toBe('Tone 2');
    expect(uniqueName('Tone', ['Tone', 'Tone 2'])).toBe('Tone 3');
    expect(uniqueName('Tone', ['Tone', 'Tone 3'])).toBe('Tone 2');
  });

  it('shortens the base so the number still fits', () => {
    const base = 'a'.repeat(MAX_NAME);
    expect(uniqueName(base, [base])).toBe(`${'a'.repeat(MAX_NAME - 2)} 2`);
    const taken = [base, ...Array.from({ length: 8 }, (_, i) => `${'a'.repeat(MAX_NAME - 2)} ${i + 2}`)];
    expect(uniqueName(base, taken)).toBe(`${'a'.repeat(MAX_NAME - 3)} 10`);
    expect(uniqueName('Tone', ['Tone'], 5)).toBe('Ton 2');
  });

  it('cuts a free name to the max length', () => {
    expect(uniqueName('a'.repeat(80), [])).toBe('a'.repeat(MAX_NAME));
  });

  it('stays unique when the base is longer than max', () => {
    const name = 'a'.repeat(MAX_NAME);
    expect(uniqueName(`${name} copy`, [name])).not.toBe(name);
  });
});

describe.each([
  ['presets', presets()],
  ['starterSounds', starterSounds()],
])('%s', (_, sounds) => {
  it.each(sounds.map((p) => [p.name, p]))('%s comes back unchanged from a save and reload', (name, patch) => {
    expect(normalizePatch(JSON.parse(JSON.stringify(patch)))).toEqual(patch);
  });
});

describe('starterSounds', () => {
  it('covers eight roles with unique names', () => {
    expect(starterSounds().map((p) => p.name)).toEqual(['Tap', 'Toggle on', 'Toggle off', 'Send', 'Receive', 'Success', 'Error', 'Notification']);
  });
});

describe('oppositePatch', () => {
  const [tap, toggleOn, , send] = starterSounds();

  it('mirrors pitched layers in time and leaves the click where it was', () => {
    const off = oppositePatch(toggleOn);
    expect(off.name).toBe('Toggle off');
    expect(off.layers.map((L) => [L.name, L.type, L.start])).toEqual([
      ['Click', 'noise', 0],
      ['Low', 'tone', 35],
      ['High', 'tone', 0],
    ]);
  });

  it('runs every slide and sweep the other way', () => {
    const [body] = oppositePatch(tap).layers;
    expect([body.pitchStart, body.pitchEnd]).toEqual([tap.layers[0].pitchEnd, tap.layers[0].pitchStart]);
    const [air] = oppositePatch(send).layers;
    expect(send.layers[0].filter.envAmt).toBe(-1.5);
    expect(air.filter.envAmt).toBe(1.5);
    const clip = { ...layerDefaults('sample'), pitch: 3, slideTo: -5, glide: 80 };
    expect(oppositePatch({ ...tap, layers: [clip] }).layers[0]).toMatchObject({ pitch: -5, slideTo: 3 });
  });

  it('names the result with the opposite word, or adds "reversed"', () => {
    expect(oppositePatch(send).name).toBe('Receive');
    expect(oppositePatch(tap).name).toBe('Tap reversed');
  });

  it('gives the copy fresh ids and leaves the original alone', () => {
    const before = structuredClone(toggleOn);
    const off = oppositePatch(toggleOn);
    expect(off.id).not.toBe(toggleOn.id);
    expect(off.layers.filter((L) => toggleOn.layers.some((O) => O.id === L.id))).toEqual([]);
    expect(toggleOn).toEqual(before);
  });
});
