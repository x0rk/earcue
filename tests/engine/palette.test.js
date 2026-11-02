import { describe, expect, it } from 'vitest';
import { blankPatch, layerDefaults, LOUDNESS } from '../../src/engine/model.js';
import {
  centsFromKey,
  centsFromRelated,
  hzOf,
  midiOf,
  normalizeKey,
  normalizeLoudness,
  retuneMidi,
  retunePatch,
  STARTER_KEY,
  tierOf,
  widerKey,
} from '../../src/engine/palette.js';

const D6 = 1174.66;
// MIDI note numbers, so the tests read as notes.
const N = { E5: 76, A5: 81, Bb5: 82, B5: 83, C6: 84, Db6: 85, D6: 86, Eb6: 87, E6: 88, F6: 89, Gb6: 90 };
const C_PENT = { root: 0, scale: 'major-pentatonic' };
const BB_MINOR_PENT = { root: 10, scale: 'minor-pentatonic' };
const C_MINOR = { root: 0, scale: 'minor' };

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

describe('centsFromRelated', () => {
  it('also accepts the other notes of the wider scale around a pentatonic key', () => {
    expect(widerKey(STARTER_KEY)).toEqual({ root: 10, scale: 'major' });
    // A and E-flat are in B-flat major but not in its pentatonic scale.
    expect(centsFromRelated(440, STARTER_KEY)).toBeLessThan(1);
    expect(centsFromRelated(hzOf(N.Eb6), STARTER_KEY)).toBeLessThan(1);
    expect(centsFromRelated(hzOf(N.E6), STARTER_KEY)).toBeCloseTo(100, 6);
  });

  it('is the same as centsFromKey for a seven-note key', () => {
    expect(widerKey(C_MINOR)).toBeNull();
    for (const hz of [440, 1000, D6]) expect(centsFromRelated(hz, C_MINOR)).toBeCloseTo(centsFromKey(hz, C_MINOR), 9);
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

describe('retuneMidi', () => {
  it('moves every note by the same step when only the key note changes', () => {
    expect(retuneMidi(N.D6, STARTER_KEY, C_PENT)).toBe(N.E6);
    expect(retuneMidi(N.Bb5, STARTER_KEY, C_PENT)).toBe(N.C6);
  });

  it('keeps each note on the same step of the scale when the scale changes', () => {
    // D is the third note of B-flat major pentatonic; the third of B-flat minor pentatonic is E-flat.
    expect(retuneMidi(N.D6, STARTER_KEY, BB_MINOR_PENT)).toBe(N.Eb6);
    expect(retuneMidi(N.Bb5, STARTER_KEY, BB_MINOR_PENT)).toBe(N.Bb5);
  });

  it('moves to the nearest copy of the new key, never more than half an octave', () => {
    for (let root = 0; root < 12; root++) {
      const moved = retuneMidi(N.Bb5, STARTER_KEY, { root, scale: 'major-pentatonic' }) - N.Bb5;
      expect(Math.abs(moved)).toBeLessThanOrEqual(6);
    }
  });

  it('keeps a note of the wider scale on its step of that scale', () => {
    // E-flat is the fourth of B-flat major: in C major it becomes F, in C minor it stays the fourth, F.
    expect(retuneMidi(N.Eb6, STARTER_KEY, C_PENT)).toBe(N.F6);
    expect(retuneMidi(N.Eb6, STARTER_KEY, C_MINOR)).toBe(N.F6);
    // A, the seventh, becomes B in C major and B-flat in C minor.
    expect(retuneMidi(N.A5, STARTER_KEY, C_PENT)).toBe(N.B5);
    expect(retuneMidi(N.A5, STARTER_KEY, C_MINOR)).toBe(N.Bb5);
  });

  it('keeps a clash a clash', () => {
    // E is a tritone above B-flat; a tritone above C is F-sharp.
    expect(retuneMidi(N.E6, STARTER_KEY, C_PENT)).toBe(N.Gb6);
    expect(retuneMidi(N.B5, STARTER_KEY, C_PENT)).toBe(N.Db6);
  });

  it('keeps a slight detune', () => {
    expect(retuneMidi(N.D6 + 0.1, STARTER_KEY, C_PENT)).toBeCloseTo(N.E6 + 0.1, 9);
    expect(retuneMidi(N.D6 - 0.2, STARTER_KEY, BB_MINOR_PENT)).toBeCloseTo(N.Eb6 - 0.2, 9);
  });

  it('comes back to where it started after a change of key and back', () => {
    const keys = [C_PENT, { root: 3, scale: 'major-pentatonic' }, { root: 7, scale: 'major-pentatonic' }];
    for (let midi = 60; midi < 96; midi += 0.25) for (const k of keys) expect(retuneMidi(retuneMidi(midi, STARTER_KEY, k), k, STARTER_KEY)).toBeCloseTo(midi, 9);
  });

  it('moves each note to the nearest note of the key when there was no key before', () => {
    expect(retuneMidi(N.D6 + 0.3, null, C_PENT)).toBe(N.D6);
    expect(retuneMidi(N.Eb6 + 0.3, null, C_PENT)).toBe(N.E6);
    expect(retuneMidi(N.B5 + 0.3, null, C_PENT)).toBe(N.C6);
  });

  it('leaves the note alone when the new key is no key', () => {
    expect(retuneMidi(N.D6 + 0.3, STARTER_KEY, null)).toBe(N.D6 + 0.3);
  });
});

describe('retunePatch', () => {
  const tone = (from, to, over) => ({ ...layerDefaults('tone'), pitchStart: hzOf(from), pitchEnd: hzOf(to), ...over });
  const patchOf = (...layers) => ({ ...blankPatch('Test'), layers });
  const midi = (hz) => Math.round(midiOf(hz) * 1000) / 1000;

  it('moves tones and struck objects, and leaves noise alone', () => {
    const noise = layerDefaults('noise');
    const p = patchOf(tone(N.D6, N.Bb5, { glide: 12 }), { ...layerDefaults('modal'), freq: hzOf(N.F6) }, noise);
    expect(retunePatch(p, STARTER_KEY, C_PENT)).toBe(true);
    expect([midi(p.layers[0].pitchStart), midi(p.layers[0].pitchEnd), midi(p.layers[1].freq)]).toEqual([N.E6, N.C6, 91]);
    expect(p.layers[2]).toEqual(noise);
  });

  it('moves a recording with a clear pitch, by changing its pitch in semitones', () => {
    const sample = { ...layerDefaults('sample'), sampleId: 's1', pitch: 2, slideTo: 2 };
    const p = patchOf(sample, { ...layerDefaults('sample'), sampleId: 'unpitched', pitch: 2 });
    // The recording plays B-flat at its own speed, so pitch 2 plays C, the second note of the key.
    retunePatch(p, STARTER_KEY, C_PENT, (id) => (id === 's1' ? hzOf(N.Bb5) : null));
    expect(p.layers[0].pitch).toBeCloseTo(4, 9);
    expect(p.layers[0].slideTo).toBeCloseTo(4, 9);
    expect(p.layers[1].pitch).toBe(2);
  });

  it('says nothing moved when every note is already in place', () => {
    const p = patchOf(tone(N.D6, N.D6));
    const before = structuredClone(p);
    expect(retunePatch(p, STARTER_KEY, STARTER_KEY)).toBe(false);
    expect(retunePatch(p, null, STARTER_KEY)).toBe(false);
    expect(p).toEqual(before);
  });

  it('keeps a deliberate clash when a key is first picked', () => {
    const p = { ...patchOf(tone(N.E6, N.E6)), tension: true };
    expect(retunePatch(p, null, STARTER_KEY)).toBe(false);
    expect(midi(p.layers[0].pitchStart)).toBe(N.E6);
    expect(retunePatch(p, STARTER_KEY, C_PENT)).toBe(true);
    expect(midi(p.layers[0].pitchStart)).toBe(N.Gb6);
  });

  it('stays inside the range a tone can play', () => {
    const p = patchOf(tone(N.D6, 135));
    retunePatch(p, STARTER_KEY, { root: 4, scale: 'major-pentatonic' });
    expect(p.layers[0].pitchEnd).toBeLessThanOrEqual(12000);
  });
});

describe('loudness', () => {
  it('fills in the default for each tier and keeps levels in range', () => {
    expect(normalizeLoudness()).toEqual(LOUDNESS);
    expect(normalizeLoudness({ frequent: -30, confirm: 'loud', alert: 4, extra: 1 })).toEqual({ frequent: -30, confirm: LOUDNESS.confirm, alert: -1 });
  });

  it('puts a sound in the loudest tier of the interactions it plays for', () => {
    const sounds = ['Tap', 'Send', 'Error', 'Spare'].map((name) => ({ ...blankPatch(name), id: name }));
    const set = { sounds, roles: {} };
    expect(sounds.map((s) => tierOf(set, s.id))).toEqual(['frequent', 'confirm', 'alert', null]);
    expect(tierOf({ sounds, roles: { notification: 'Tap' } }, 'Tap')).toBe('alert');
  });
});
