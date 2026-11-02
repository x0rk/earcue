import { OfflineAudioContext } from 'node-web-audio-api';
import { describe, expect, it } from 'vitest';
import { seedRandom } from '../helpers.js';

globalThis.OfflineAudioContext = OfflineAudioContext;
seedRandom();
const { checkSet } = await import('../../src/engine/checks.js');
const { hzOf, STARTER_KEY } = await import('../../src/engine/palette.js');
const { blankPatch, layerDefaults, starterSounds } = await import('../../src/engine/model.js');
const { renderPatch } = await import('../../src/engine/render.js');

const D6 = 1174.66;
// MIDI note numbers, so the tests read as notes.
const N = { A5: 81, Bb5: 82, B5: 83, E6: 88 };

describe('checkSet', () => {
  const tone = (hz, over) => ({ ...layerDefaults('tone'), pitchStart: hz, pitchEnd: hz, ...over });
  const sound = (name, ...layers) => ({ ...blankPatch(name), layers: layers.length ? layers : [tone(D6)] });
  const tap = sound('Tap');
  const send = sound('Send');
  const error = sound('Error');
  const QUIET = { peakDb: -24, rmsDb: -44, audibleMs: 40, onsetMs: 0.1, centroid: 2400, lowShare: 0.01 };
  const LOUD = { ...QUIET, peakDb: -18, rmsDb: -34 };

  // Runs checkSet on made-up measurements: each sound starts QUIET (alerts LOUD), then takes its changes.
  function issues(changes = {}, { sounds = [tap, send, error], key = STARTER_KEY, roles = {}, samplePitch } = {}) {
    const measures = new Map(sounds.map((s) => [s.id, { ...(s.name === 'Error' ? LOUD : QUIET), ...changes[s.name] }]));
    return checkSet({ sounds, key, roles }, measures, { samplePitch }).map(({ name, kind }) => `${name}: ${kind}`);
  }
  const withSend = (...layers) => [tap, sound('Send', ...layers), error];

  it('finds nothing wrong with a set that follows the rules', () => {
    expect(issues()).toEqual([]);
  });

  it('flags a sound that starts more than 5 ms late', () => {
    expect(issues({ Tap: { onsetMs: 5 } })).toEqual([]);
    expect(issues({ Tap: { onsetMs: 5.1 } })).toEqual(['Tap: late']);
  });

  it('flags a sound with more than 20% of its energy in the bass', () => {
    expect(issues({ Send: { lowShare: 0.2 } })).toEqual([]);
    expect(issues({ Send: { lowShare: 0.21 } })).toEqual(['Send: bass']);
  });

  it.each([
    ['Tap', 100],
    ['Send', 250],
    ['Error', 500],
  ])('flags %s when it rings past %i ms', (name, budget) => {
    expect(issues({ [name]: { audibleMs: budget } })).toEqual([]);
    expect(issues({ [name]: { audibleMs: budget + 1 } })).toEqual([`${name}: long`]);
  });

  it('flags a tone outside the key, only when the set has a key', () => {
    const offKey = [tap, sound('Send', tone(1000)), error];
    expect(issues({}, { sounds: offKey })).toEqual(['Send: key']);
    expect(issues({}, { sounds: offKey, key: null })).toEqual([]);
    expect(issues({}, { sounds: [tap, sound('Send', tone(D6, { pitchEnd: 1000 })), error] })).toEqual([]);
    expect(issues({}, { sounds: [tap, sound('Send', tone(D6, { pitchEnd: 1000, glide: 30 })), error] })).toEqual(['Send: key']);
  });

  it('lets notes of the wider scale through, and flags the rest', () => {
    expect(issues({}, { sounds: withSend(tone(440)) })).toEqual([]);
    expect(issues({}, { sounds: withSend(tone(hzOf(N.E6))) })).toEqual(['Send: key']);
  });

  it('leaves out a sound that clashes on purpose', () => {
    expect(issues({}, { sounds: [tap, { ...sound('Send', tone(hzOf(N.E6))), tension: true }, error] })).toEqual([]);
  });

  it('counts only the landing of a quick slide that lands in key', () => {
    expect(issues({}, { sounds: withSend(tone(hzOf(N.E6), { pitchEnd: D6, glide: 40 })) })).toEqual([]);
    expect(issues({}, { sounds: withSend(tone(hzOf(N.E6), { pitchEnd: D6, glide: 41 })) })).toEqual(['Send: key']);
  });

  it('checks what you hear: muted layers are skipped, and only soloed ones count while any is soloed', () => {
    expect(issues({}, { sounds: withSend(tone(D6), tone(hzOf(N.E6), { on: false })) })).toEqual([]);
    expect(issues({}, { sounds: withSend(tone(D6, { solo: true }), tone(hzOf(N.E6))) })).toEqual([]);
  });

  it('checks a recording when it has a clear pitch', () => {
    const recording = { ...layerDefaults('sample'), sampleId: 's1', pitch: 3 };
    // At its own speed the recording plays D6, so three semitones up is F, in the key; two is E, outside it.
    expect(issues({}, { sounds: withSend(recording), samplePitch: () => D6 })).toEqual([]);
    expect(issues({}, { sounds: withSend({ ...recording, pitch: 2 }), samplePitch: () => D6 })).toEqual(['Send: key']);
    expect(issues({}, { sounds: withSend({ ...recording, pitch: 2 }), samplePitch: () => null })).toEqual([]);
  });

  it('flags a note that rubs against the end of the sound before it', () => {
    // A and B-flat both fit the key, but a half step apart they clash when Send follows Tap.
    const sounds = [sound('Tap', tone(hzOf(N.A5))), sound('Send', tone(hzOf(N.Bb5))), error];
    expect(issues({}, { sounds })).toEqual(['Send: clash']);
    expect(issues({}, { sounds, key: null })).toEqual([]);
    expect(issues({}, { sounds: [sounds[0], { ...sounds[1], tension: true }, error] })).toEqual([]);
    expect(issues({}, { sounds: [sound('Tap', tone(hzOf(N.Bb5))), sound('Send', tone(hzOf(N.Bb5 + 7))), error] })).toEqual([]);
  });

  it('compares where the first sound ends with where the next begins', () => {
    const toggleOn = sound('Toggle on', tone(D6), tone(hzOf(N.A5), { start: 35 }));
    const toggleOff = sound('Toggle off', tone(hzOf(N.Bb5)), tone(D6, { start: 35 }));
    // On ends on A and Off starts on B-flat; Off ends on D, where On starts.
    expect(issues({}, { sounds: [toggleOn, toggleOff, error] })).toEqual(['Toggle off: clash']);
  });

  it('flags a frequent sound that is as loud as the quietest alert', () => {
    expect(issues({ Tap: { rmsDb: LOUD.rmsDb - 0.1 } })).toEqual([]);
    expect(issues({ Tap: { rmsDb: LOUD.rmsDb } })).toEqual(['Tap: loud']);
  });

  it('flags a silent sound and checks nothing else about it', () => {
    expect(issues({ Send: { peakDb: -Infinity, rmsDb: -Infinity, onsetMs: 50, lowShare: 1, audibleMs: 0 } })).toEqual(['Send: silent']);
  });

  it('reports each kind once per sound', () => {
    const roles = { hover: tap.id, select: tap.id };
    expect(issues({ Tap: { audibleMs: 300, rmsDb: LOUD.rmsDb } }, { roles })).toEqual(['Tap: long', 'Tap: loud']);
    expect(issues({}, { sounds: [tap, sound('Send', tone(1000), tone(1100)), error] })).toEqual(['Send: key']);
  });

  it('checks every take of an interaction, since any of them can play', () => {
    const tap2 = sound('Tap 2');
    expect(issues({ 'Tap 2': { audibleMs: 140 } }, { sounds: [tap, tap2, send, error] })).toEqual(['Tap 2: long']);
    expect(issues({ 'Tap 2': { rmsDb: LOUD.rmsDb } }, { sounds: [tap, tap2, send, error] })).toEqual(['Tap 2: loud']);
    // The second take of Toggle on sits a half step from Toggle off, so it rubs played either way round.
    const on = sound('Toggle on', tone(D6));
    const on2 = sound('Toggle on 2', tone(hzOf(N.E6 - 1)));
    const off = sound('Toggle off', tone(D6));
    expect(issues({}, { sounds: [on, on2, off, error] })).toEqual(['Toggle off: clash', 'Toggle on 2: clash']);
  });

  it('gives a celebration and one cycle of a loop more time than their tier', () => {
    const ring = sound('Ring');
    const celebrate = sound('Celebrate');
    const sounds = [tap, ring, celebrate, error];
    expect(issues({ Ring: { ...LOUD, audibleMs: 1900 }, Celebrate: { ...LOUD, audibleMs: 1100 } }, { sounds })).toEqual([]);
    const long = checkSet({ sounds, key: null, roles: {} }, new Map(sounds.map((x) => [x.id, x === tap ? QUIET : { ...LOUD, audibleMs: 2100 }])));
    expect(long.map((i) => i.text)).toEqual([
      'Lasts 2100 ms. As one cycle of the Ring loop, keep it under 2000 ms.',
      'Lasts 2100 ms. As the Celebrate sound, keep it under 1200 ms.',
      'Lasts 2100 ms. As the Error sound, keep it under 500 ms.',
    ]);
  });

  it('passes the starter set, rendered for real', async () => {
    const sounds = starterSounds();
    const measures = new Map();
    for (const p of sounds) measures.set(p.id, (await renderPatch(p, 48000)).m);
    expect(checkSet({ sounds, key: STARTER_KEY, roles: {} }, measures)).toEqual([]);
  });
});
