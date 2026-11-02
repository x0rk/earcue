import { OfflineAudioContext } from 'node-web-audio-api';
import { describe, expect, it } from 'vitest';
import { seedRandom } from '../helpers.js';

globalThis.OfflineAudioContext = OfflineAudioContext;
seedRandom();
const { checkSet } = await import('../../src/engine/checks.js');
const { familyOf, mainPitch } = await import('../../src/engine/family.js');
const { blankPatch, layerDefaults, LOUDNESS, MAX_LAYERS, normalizePatch, presets, starterSounds } = await import('../../src/engine/model.js');
const { centsFromKey, hzOf, midiOf, STARTER_KEY } = await import('../../src/engine/palette.js');
const { renderPatch } = await import('../../src/engine/render.js');

const NAMES = ['Tap', 'Toggle on', 'Toggle off', 'Send', 'Receive', 'Success', 'Error', 'Notification'];
const [tap] = starterSounds();
const tone = (hz, over) => ({ ...layerDefaults('tone'), pitchStart: hz, pitchEnd: hz, ...over });
const sourceOf = (name, ...layers) => ({ ...blankPatch(name), layers });
const find = (family, name) => family.sounds.find((s) => s.name === name);
// Where each tone layer lands, in semitones from the given MIDI root.
const steps = (sound, root) => sound.layers.filter((L) => L.type === 'tone').map((L) => Math.round(midiOf(L.pitchEnd) - root));

describe('mainPitch', () => {
  it('takes where the loudest pitched layer lands', () => {
    expect(mainPitch(tap.layers)).toBeCloseTo(932.33, 1);
    expect(mainPitch([tone(440, { level: -12 }), tone(660), layerDefaults('noise')])).toBe(660);
    expect(mainPitch([layerDefaults('noise')])).toBeNull();
  });
});

describe('familyOf', () => {
  const family = familyOf(tap);

  it('makes the eight interactions, in the key the source lands in', () => {
    expect(family.sounds.map((s) => s.name)).toEqual(NAMES);
    expect(family.key).toEqual(STARTER_KEY);
    expect(family.sounds.map((s) => s.master.out)).toEqual([...Array(3).fill(LOUDNESS.frequent), ...Array(3).fill(LOUDNESS.confirm), LOUDNESS.alert, LOUDNESS.alert]);
    expect(family.sounds.map((s) => s.master.variation)).toEqual([20, 10, 10, 0, 0, 0, 0, 0]);
  });

  it('rises for good news and falls for endings, in steps of the key', () => {
    const root = 82;
    expect(NAMES.map((name) => steps(find(family, name), root))).toEqual([[0], [0, 7], [7, 0], [7], [7, 0], [0, 4, 7], [-5, -6], [7, 12]]);
  });

  it('keeps every note in the key, except the error, which clashes on purpose', () => {
    for (const s of family.sounds) {
      const off = s.layers.filter((L) => L.type === 'tone' && centsFromKey(L.pitchEnd, family.key) > 1);
      expect(off.length, s.name).toBe(s.name === 'Error' ? 1 : 0);
    }
    expect(family.sounds.filter((s) => s.tension).map((s) => s.name)).toEqual(['Error']);
  });

  it('tunes a source that is a little off to the nearest note', () => {
    const { sounds, key } = familyOf(sourceOf('Beep', tone(450)));
    expect(key).toEqual({ root: 9, scale: 'major-pentatonic' });
    expect(sounds[0].layers[0].pitchStart).toBeCloseTo(440, 6);
  });

  it('plays a low error an octave up, so it stays above what small speakers drop', () => {
    const low = familyOf(sourceOf('Low', tone(220)));
    expect(steps(find(low, 'Error'), 57)).toEqual([7, 6]);
    expect(steps(find(familyOf(sourceOf('High', tone(880))), 'Error'), 81)).toEqual([-5, -6]);
  });

  it('builds from a recording with a clear pitch, and every sound shares its audio', () => {
    const recording = { ...layerDefaults('sample'), sampleId: 'rec' };
    const { sounds, key } = familyOf(sourceOf('Knock', recording), { samplePitch: () => hzOf(76), sampleMs: () => 400 });
    expect(key).toEqual({ root: 4, scale: 'major-pentatonic' });
    expect(new Set(sounds.flatMap((s) => s.layers.map((L) => L.sampleId)))).toEqual(new Set(['rec']));
    expect(sounds.find((s) => s.name === 'Success').layers.map((L) => Math.round(L.pitch * 1000) / 1000)).toEqual([0, 4, 7]);
    expect(sounds.find((s) => s.name === 'Send').layers[0]).toMatchObject({ pitch: 0, slideTo: 7, glide: 30 });
  });

  it('cuts a long recording to fit each interaction, and fades out the cut', () => {
    const recording = { ...layerDefaults('sample'), sampleId: 'rec', trimStart: 20 };
    const { sounds } = familyOf(sourceOf('Knock', recording), { sampleMs: () => 400 });
    const [tapLayer] = sounds[0].layers;
    expect(400 - tapLayer.trimStart - tapLayer.trimEnd).toBeCloseTo(70, 6);
    expect(tapLayer.fadeOut).toBeCloseTo(28, 6);
    // An octave up plays twice as fast, so the notification's second hit plays all 380 ms of clip in 190 ms.
    const high = find({ sounds }, 'Notification').layers[1];
    expect(high.trimEnd).toBe(0);
  });

  it('shortens synth layers to fit, and never lengthens them', () => {
    const { sounds } = familyOf(sourceOf('Long', tone(440, { attack: 1, hold: 40, decay: 900 })));
    const [tapLayer] = sounds[0].layers;
    expect(tapLayer.attack + tapLayer.hold + tapLayer.decay).toBeCloseTo(70, 6);
    expect(familyOf(sourceOf('Short', tone(440, { decay: 20 }))).sounds[0].layers[0].decay).toBe(20);
  });

  it('strikes an object again where a slide would go, since it cannot slide', () => {
    const pebble = presets().find((p) => p.name === 'Pebble');
    const send = find(familyOf(pebble), 'Send');
    expect(send.layers.map((L) => [L.start, Math.round(midiOf(L.freq))])).toEqual([
      [0, 85],
      [30, 92],
    ]);
  });

  it('gives a source with no clear pitch a family with no key', () => {
    const { sounds, key } = familyOf(sourceOf('Swish', layerDefaults('noise')));
    expect(key).toBeNull();
    expect(sounds.map((s) => s.name)).toEqual(NAMES);
  });

  it('builds from what you hear, and returns null when nothing is', () => {
    const solo = familyOf({ ...tap, layers: [{ ...tap.layers[0], solo: true }, tap.layers[1]] });
    expect(solo.sounds[0].layers.map((L) => L.type)).toEqual(['tone']);
    expect(solo.sounds[0].layers[0].solo).toBe(false);
    expect(familyOf({ ...tap, layers: tap.layers.map((L) => ({ ...L, on: false })) })).toBeNull();
  });

  it('stays within the layer limit, with fresh ids and unique names', () => {
    const big = sourceOf('Big', ...Array.from({ length: 40 }, () => tone(440)));
    for (const s of familyOf(big).sounds) {
      expect(s.layers.length).toBeLessThanOrEqual(MAX_LAYERS);
      expect(new Set(s.layers.map((L) => L.name)).size).toBe(s.layers.length);
    }
    const ids = family.sounds.flatMap((s) => [s.id, ...s.layers.map((L) => L.id)]);
    expect(new Set([...ids, tap.id, ...tap.layers.map((L) => L.id)]).size).toBe(ids.length + 1 + tap.layers.length);
  });

  it('leaves the source as it was', () => {
    const before = structuredClone(tap);
    familyOf(tap);
    expect(tap).toEqual(before);
  });

  it.each([
    ['the starter tap', tap],
    ['a struck object', presets().find((p) => p.name === 'Soft Tap')],
  ])('passes the set checks when made from %s, rendered for real', async (_, source) => {
    const { sounds, key } = familyOf(source);
    const measures = new Map();
    for (const p of sounds) measures.set(p.id, (await renderPatch(normalizePatch(p), 48000)).m);
    expect(checkSet({ sounds, key, roles: {} }, measures)).toEqual([]);
  });
});
