import { OfflineAudioContext } from 'node-web-audio-api';
import { describe, expect, it } from 'vitest';
import { seedRandom } from '../helpers.js';

globalThis.OfflineAudioContext = OfflineAudioContext;
seedRandom();
const { centsFromKey, checkSet, normalizeKey, STARTER_KEY } = await import('../../src/engine/checks.js');
const { blankPatch, layerDefaults, starterSounds } = await import('../../src/engine/model.js');
const { renderPatch } = await import('../../src/engine/render.js');

const D6 = 1174.66;

describe('centsFromKey', () => {
  it('measures from the nearest note of the key', () => {
    expect(STARTER_KEY).toEqual({ root: 10, scale: 'major-pentatonic' });
    expect(centsFromKey(D6, STARTER_KEY)).toBeLessThan(1);
    expect(centsFromKey(1000, STARTER_KEY)).toBeGreaterThan(30);
    expect(centsFromKey(1000, STARTER_KEY)).toBeCloseTo(78.7, 1);
    expect(centsFromKey(440, STARTER_KEY)).toBeCloseTo(100, 6);
  });

  it('finds the same note in every octave', () => {
    for (const hz of [D6 / 8, D6 / 2, D6 * 2]) expect(centsFromKey(hz, STARTER_KEY)).toBeLessThan(1);
  });
});

describe('normalizeKey', () => {
  it('keeps a valid key', () => {
    expect(normalizeKey({ root: 10, scale: 'major-pentatonic', extra: 1 })).toEqual({ root: 10, scale: 'major-pentatonic' });
    expect(normalizeKey({ root: 0, scale: 'minor' })).toEqual({ root: 0, scale: 'minor' });
  });

  it('rejects bad roots', () => {
    for (const root of [-1, 12, 1.5, '3', NaN, null, undefined]) expect(normalizeKey({ root, scale: 'major' })).toBeNull();
  });

  it('rejects unknown scales and values that are not keys', () => {
    for (const scale of ['blues', '', 'Major', 7, undefined]) expect(normalizeKey({ root: 0, scale })).toBeNull();
    for (const raw of [null, undefined, 'C major', 5]) expect(normalizeKey(raw)).toBeNull();
  });

  it('rejects scale names inherited from Object.prototype', () => {
    for (const scale of ['constructor', 'toString', '__proto__']) expect(normalizeKey({ root: 0, scale })).toBeNull();
  });
});

describe('checkSet', () => {
  const tone = (hz, over) => ({ ...layerDefaults('tone'), pitchStart: hz, pitchEnd: hz, ...over });
  const sound = (name, ...layers) => ({ ...blankPatch(name), layers: layers.length ? layers : [tone(D6)] });
  const tap = sound('Tap');
  const send = sound('Send');
  const error = sound('Error');
  const QUIET = { peakDb: -24, rmsDb: -44, audibleMs: 40, onsetMs: 0.1, centroid: 2400, lowShare: 0.01 };
  const LOUD = { ...QUIET, peakDb: -18, rmsDb: -34 };

  // Runs checkSet on made-up measurements: each sound starts QUIET (alerts LOUD), then takes its changes.
  function issues(changes = {}, { sounds = [tap, send, error], key = STARTER_KEY, roles = {} } = {}) {
    const measures = new Map(sounds.map((s) => [s.id, { ...(s.name === 'Error' ? LOUD : QUIET), ...changes[s.name] }]));
    return checkSet({ sounds, key, roles }, measures).map(({ name, kind }) => `${name}: ${kind}`);
  }

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

  it('passes the starter set, rendered for real', async () => {
    const sounds = starterSounds();
    const measures = new Map();
    for (const p of sounds) measures.set(p.id, (await renderPatch(p, 48000)).m);
    expect(checkSet({ sounds, key: STARTER_KEY, roles: {} }, measures)).toEqual([]);
  });
});
