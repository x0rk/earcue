import { describe, expect, it } from 'vitest';
import { fmtHz, fmtHzUnit, fmtLevel, fmtNum, fmtPan, fmtSigned, hzToNote, NOTE_NAMES } from '../../src/lib/format.js';

describe('hzToNote', () => {
  it('names the note and octave', () => {
    expect(hzToNote(440)).toBe('A4');
    expect(hzToNote(261.63)).toBe('C4');
    expect(hzToNote(932.33)).toBe('Bb5');
    expect(hzToNote(27.5)).toBe('A0');
    expect(hzToNote(4186.01)).toBe('C8');
  });

  it('adds the cents when a pitch sits between notes', () => {
    expect(hzToNote(450)).toBe('A4 +39c');
    expect(hzToNote(430)).toBe('A4 -40c');
  });

  it('returns nothing for zero, negative and missing pitches', () => {
    for (const hz of [0, -5, NaN, undefined]) expect(hzToNote(hz)).toBe('');
  });

  it('uses flats for the black keys', () => {
    expect(NOTE_NAMES).toEqual(['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']);
  });
});

describe('fmtHz and fmtHzUnit', () => {
  it('rounds below 1 kHz', () => {
    expect(fmtHz(440)).toBe('440');
    expect(fmtHz(999.4)).toBe('999');
    expect(fmtHzUnit(250)).toBe('250 Hz');
  });

  it('shortens kilohertz and drops trailing zeros', () => {
    expect(fmtHz(1000)).toBe('1k');
    expect(fmtHz(1500)).toBe('1.5k');
    expect(fmtHz(2600)).toBe('2.6k');
    expect(fmtHz(12345)).toBe('12.3k');
    expect(fmtHz(20000)).toBe('20k');
    expect(fmtHzUnit(4800)).toBe('4.8k Hz');
  });
});

describe('fmtLevel', () => {
  it('shows one decimal and the unit', () => {
    expect(fmtLevel(-6)).toBe('-6.0 dB');
    expect(fmtLevel(-99.9)).toBe('-99.9 dB');
    expect(fmtLevel(-3.25, 'dBFS')).toBe('-3.3 dBFS');
  });

  it('says Silent from -100 dB down', () => {
    for (const v of [-100, -120, -Infinity, NaN]) expect(fmtLevel(v)).toBe('Silent');
  });
});

describe('fmtNum, fmtSigned and fmtPan', () => {
  it('fmtNum drops trailing zeros and never shows -0', () => {
    expect(fmtNum(3.14159, 2)).toBe('3.14');
    expect(fmtNum(1.1, 2)).toBe('1.1');
    expect(fmtNum(2.5)).toBe('3');
    expect(fmtNum(-0.001, 2)).toBe('0');
  });

  it('fmtSigned marks positive values with a plus', () => {
    expect(fmtSigned(3)).toBe('+3.0');
    expect(fmtSigned(-2.25, 2)).toBe('-2.25');
    expect(fmtSigned(0)).toBe('0.0');
  });

  it('fmtPan reads Center near zero and a side otherwise', () => {
    expect(fmtPan(0)).toBe('Center');
    expect(fmtPan(-0.004)).toBe('Center');
    expect(fmtPan(0.5)).toBe('50% R');
    expect(fmtPan(-1)).toBe('100% L');
    expect(fmtPan(0.333)).toBe('33% R');
  });
});
