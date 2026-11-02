import { AudioScheduledSourceNode, OfflineAudioContext } from 'node-web-audio-api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_NAME } from '../../src/brand.js';
import { encodeWav, makeZip, moduleSource, readme, readPatchFile, setModuleSource, setReadme, slug } from '../../src/engine/export.js';
import { blankPatch, layerDefaults } from '../../src/engine/model.js';
import { floatToB64, samples } from '../../src/engine/samples.js';
import { importSource } from '../helpers.js';

const enc = new TextEncoder();
const view = (bytes) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const fakeRes = { gain: 0.5, duration: 0.2 };

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  samples.clear();
});

describe('slug', () => {
  it('lowercases and joins words with dashes', () => {
    expect(slug('Toggle on')).toBe('toggle-on');
    expect(slug('  Level 2: Done!  ')).toBe('level-2-done');
  });

  it('keeps letters, marks and digits in any script', () => {
    expect(slug('タップ')).toBe('タップ');
    expect(slug('通知')).toBe('通知');
    expect(slug('नमस्ते')).toBe('नमस्ते');
    expect(slug('Ошибка 2')).toBe('ошибка-2');
  });

  it('normalizes to NFC, so one name typed two ways gives one slug', () => {
    expect(slug('Cafe\u0301')).toBe('caf\u00e9');
    expect(slug('Caf\u00e9')).toBe('caf\u00e9');
  });

  it('falls back to "sound" when nothing is left', () => {
    expect(slug('!!!')).toBe('sound');
    expect(slug('')).toBe('sound');
  });
});

function wavHeader(bytes) {
  const v = view(bytes);
  const tag = (o) => String.fromCharCode(...bytes.subarray(o, o + 4));
  return {
    riff: tag(0),
    riffSize: v.getUint32(4, true),
    wave: tag(8),
    fmt: tag(12),
    fmtSize: v.getUint32(16, true),
    format: v.getUint16(20, true),
    channels: v.getUint16(22, true),
    sampleRate: v.getUint32(24, true),
    byteRate: v.getUint32(28, true),
    blockAlign: v.getUint16(32, true),
    bits: v.getUint16(34, true),
    data: tag(36),
    dataSize: v.getUint32(40, true),
  };
}

describe('encodeWav', () => {
  it('writes a PCM header for 16-bit stereo', () => {
    const bytes = encodeWav([new Float32Array(3), new Float32Array(3)], 48000, 16);
    expect(bytes).toHaveLength(44 + 12);
    expect(wavHeader(bytes)).toEqual({
      riff: 'RIFF',
      riffSize: 36 + 12,
      wave: 'WAVE',
      fmt: 'fmt ',
      fmtSize: 16,
      format: 1,
      channels: 2,
      sampleRate: 48000,
      byteRate: 48000 * 4,
      blockAlign: 4,
      bits: 16,
      data: 'data',
      dataSize: 12,
    });
  });

  it('pads an odd-sized 24-bit mono data chunk with one zero byte', () => {
    const bytes = encodeWav([new Float32Array([1, -1, 0.5])], 44100, 24);
    expect(bytes).toHaveLength(44 + 9 + 1);
    expect(wavHeader(bytes)).toMatchObject({ riffSize: 36 + 9 + 1, channels: 1, sampleRate: 44100, byteRate: 44100 * 3, blockAlign: 3, bits: 24, dataSize: 9 });
    expect([...bytes.subarray(44)]).toEqual([0xff, 0xff, 0x7f, 0x01, 0x00, 0x80, 0x00, 0x00, 0x40, 0x00]);
  });

  it('adds no pad byte when the data chunk is already even', () => {
    expect(encodeWav([new Float32Array(2)], 44100, 24)).toHaveLength(44 + 6);
    expect(encodeWav([new Float32Array(3), new Float32Array(3)], 44100, 24)).toHaveLength(44 + 18);
  });

  it('clips out-of-range samples', () => {
    expect([...encodeWav([new Float32Array([2, -2])], 48000, 24).subarray(44)]).toEqual([0xff, 0xff, 0x7f, 0x01, 0x00, 0x80]);
  });

  it('writes 16-bit samples little-endian', () => {
    // Equal draws cancel the TPDF dither, so the samples come out exact.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const v = view(encodeWav([new Float32Array([0.5, -0.5, 1, -1])], 48000, 16));
    expect([0, 1, 2, 3].map((i) => v.getInt16(44 + 2 * i, true))).toEqual([16384, -16383, 32767, -32767]);
  });
});

function localHeader(zip, o) {
  const v = view(zip);
  return {
    signature: v.getUint32(o, true),
    version: v.getUint16(o + 4, true),
    flags: v.getUint16(o + 6, true),
    method: v.getUint16(o + 8, true),
    time: v.getUint16(o + 10, true),
    date: v.getUint16(o + 12, true),
    crc: v.getUint32(o + 14, true),
    compressedSize: v.getUint32(o + 18, true),
    size: v.getUint32(o + 22, true),
    extraLength: v.getUint16(o + 28, true),
    name: new TextDecoder().decode(zip.subarray(o + 30, o + 30 + v.getUint16(o + 26, true))),
  };
}

function centralHeader(zip, o) {
  const v = view(zip);
  return {
    signature: v.getUint32(o, true),
    madeBy: v.getUint16(o + 4, true),
    version: v.getUint16(o + 6, true),
    flags: v.getUint16(o + 8, true),
    method: v.getUint16(o + 10, true),
    time: v.getUint16(o + 12, true),
    date: v.getUint16(o + 14, true),
    crc: v.getUint32(o + 16, true),
    compressedSize: v.getUint32(o + 20, true),
    size: v.getUint32(o + 24, true),
    extraLength: v.getUint16(o + 30, true),
    commentLength: v.getUint16(o + 32, true),
    offset: v.getUint32(o + 42, true),
    name: new TextDecoder().decode(zip.subarray(o + 46, o + 46 + v.getUint16(o + 28, true))),
  };
}

describe('makeZip', () => {
  it('writes stored entries, a central directory and CRC-32s', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 2, 4, 5, 6, 8));
    const files = [
      { name: 'check.txt', data: enc.encode('123456789') },
      { name: 'sounds/über.txt', data: enc.encode('The quick brown fox jumps over the lazy dog') },
    ];
    const blob = makeZip(files);
    expect(blob.type).toBe('application/zip');
    const zip = new Uint8Array(await blob.arrayBuffer());
    const v = view(zip);

    const time = (5 << 11) | (6 << 5) | (8 >> 1);
    const date = ((2026 - 1980) << 9) | (3 << 5) | 4;
    const crcs = [0xcbf43926, 0x414fa339];
    const entry = (f, i) => ({ version: 20, flags: 0x0800, method: 0, time, date, crc: crcs[i], compressedSize: f.data.length, size: f.data.length, extraLength: 0, name: f.name });

    const end = zip.length - 22;
    expect(v.getUint32(end, true)).toBe(0x06054b50);
    expect(v.getUint16(end + 8, true)).toBe(files.length);
    expect(v.getUint16(end + 10, true)).toBe(files.length);
    const cdSize = v.getUint32(end + 12, true);
    const cdOffset = v.getUint32(end + 16, true);
    expect(cdOffset + cdSize).toBe(end);

    let local = 0;
    let central = cdOffset;
    files.forEach((f, i) => {
      const nameLength = enc.encode(f.name).length;
      expect(localHeader(zip, local)).toEqual({ signature: 0x04034b50, ...entry(f, i) });
      expect(zip.subarray(local + 30 + nameLength, local + 30 + nameLength + f.data.length)).toEqual(f.data);
      expect(centralHeader(zip, central)).toEqual({ signature: 0x02014b50, madeBy: 20, ...entry(f, i), commentLength: 0, offset: local });
      local += 30 + nameLength + f.data.length;
      central += 46 + nameLength;
    });
    expect(local).toBe(cdOffset);
    expect(central).toBe(end);
  });
});

describe('readPatchFile', () => {
  const project = (over = {}) => JSON.stringify({ format: 'earcue-project/1', app: APP_NAME, patch: { name: 'Ping', layers: [{ type: 'tone' }] }, ...over });
  const audio = floatToB64(new Float32Array([0.5, -0.25]));

  it('rejects files that are not projects', () => {
    for (const text of ['{}', '[]', '42', '"patch"', 'null', 'not json', '{"patch":{"layers":"none"}}']) expect(() => readPatchFile(text)).toThrow();
  });

  it('normalizes the patch it reads', () => {
    const patch = readPatchFile(project({ patch: { name: 'Ping\nPong', layers: [{ type: 'tone', voices: 99 }, { type: 'nope' }] } }));
    expect(patch.name).toBe('Ping Pong');
    expect(patch.layers).toHaveLength(1);
    expect(patch.layers[0].voices).toBe(5);
  });

  it('clamps sample rates', () => {
    const channels = [audio];
    readPatchFile(project({ samples: { low: { sampleRate: 1, channels }, high: { sampleRate: 1e7, channels }, text: { sampleRate: '44100', channels }, ok: { sampleRate: 44100, channels } } }));
    expect(['low', 'high', 'text', 'ok'].map((id) => samples.get(id).sampleRate)).toEqual([8000, 192000, 48000, 44100]);
  });

  it('ignores audio whose channels are not strings', () => {
    readPatchFile(
      project({ samples: { numbers: { channels: [[0.1, 0.2]] }, mixed: { channels: [audio, 5] }, none: { channels: [] }, flat: { channels: audio }, missing: null } }),
    );
    expect([...samples.keys()]).toEqual([]);
  });

  it('decodes the audio it keeps, up to two channels', () => {
    readPatchFile(project({ samples: { clap: { name: 'Clap\n', sampleRate: 44100, channels: [audio, audio, audio] } } }));
    const clap = samples.get('clap');
    expect(clap.name).toBe('Clap');
    expect(clap.channels).toHaveLength(2);
    expect([...clap.channels[0]]).toEqual([0.5, -0.25]);
  });
});

describe('moduleSource', () => {
  const hostile = 'Ping </script><script>alert(1)</script>\nalert(2)\r\u2028alert(3)\u2029end';
  const src = moduleSource({ ...blankPatch('x'), name: hostile }, fakeRes);

  it('escapes < in names, so the module can sit inside a script tag', () => {
    expect(src.toLowerCase()).not.toContain('</script');
    expect(src).toContain('Ping \\u003c/script>\\u003cscript>alert(1)\\u003c/script>');
  });

  it('keeps names in comments on one line, without angle brackets', () => {
    expect(src.split('\n')[0]).toBe(`// Ping /scriptscriptalert(1)/script alert(2)  alert(3) end. Made with ${APP_NAME}.`);
  });

  it('still loads as a module', async () => {
    expect((await importSource(src)).playSound).toEqual(expect.any(Function));
  });
});

describe('setModuleSource', () => {
  const rendered = (bases) => bases.map((base) => ({ patch: blankPatch(base), res: fakeRes, base }));

  it('gives sounds that share a name their own keys', async () => {
    const { soundNames, playSound } = await importSource(setModuleSource(rendered(['tap', 'tap', 'tap', 'send'])));
    expect(soundNames).toEqual(['tap', 'tap-2', 'tap-3', 'send']);
    expect(() => playSound('nope', {})).toThrow('Unknown sound "nope". Available: tap, tap-2, tap-3, send');
  });

  it('keys a sound named Constructor as constructor', async () => {
    const { soundNames } = await importSource(setModuleSource(rendered(['constructor'])));
    expect(soundNames).toEqual(['constructor']);
  });

  it('rejects inherited names like toString as unknown sounds', async () => {
    const { playSound } = await importSource(setModuleSource(rendered(['tap'])));
    expect(() => playSound('toString', {})).toThrow('Unknown sound');
  });

  it('has no interaction player when the set maps no interactions', async () => {
    const src = setModuleSource(rendered(['tap']));
    expect(src).not.toContain('ROLES');
    expect((await importSource(src)).playRole).toBeUndefined();
  });
});

describe('setModuleSource with interactions', () => {
  // Each take lasts a different time, so the length playRole returns says which one played.
  const takes = [0.1, 0.2, 0.3].map((duration, i) => ({ patch: blankPatch('Tap'), res: { gain: 0.5, duration }, base: i ? `tap-${i + 1}` : 'tap' }));
  const send = { patch: blankPatch('Send'), res: { gain: 0.5, duration: 0.4 }, base: 'send' };
  const roles = { tap: takes.map((t) => t.patch.id), send: [send.patch.id], error: ['gone'] };
  const ctx = () => new OfflineAudioContext(1, 48000, 48000);

  it('plays one of an interaction\'s takes at random, never the same one twice in a row', async () => {
    const { playRole, roleNames } = await importSource(setModuleSource([...takes, send], { roles }));
    expect(roleNames).toEqual(['tap', 'send']);
    const c = ctx();
    const played = Array.from({ length: 30 }, () => playRole('tap', c));
    expect(new Set(played)).toEqual(new Set([0.1, 0.2, 0.3]));
    for (let i = 1; i < played.length; i++) expect(played[i]).not.toBe(played[i - 1]);
    expect(playRole('send', c)).toBe(0.4);
    expect(() => playRole('hasOwnProperty', c)).toThrow('Unknown interaction "hasOwnProperty". Available: tap, send');
  });

  it('loops an interaction until it is stopped', async () => {
    vi.useFakeTimers();
    try {
      const { loopRole } = await importSource(setModuleSource([send], { roles: { ring: [send.patch.id] } }));
      const c = ctx();
      const start = vi.spyOn(AudioScheduledSourceNode.prototype, 'start');
      const stop = loopRole('ring', c, { gap: 0.6 });
      const once = start.mock.calls.length;
      expect(once).toBeGreaterThan(0);
      vi.advanceTimersByTime(1000);
      expect(start.mock.calls.length).toBe(once * 2);
      stop();
      vi.advanceTimersByTime(5000);
      expect(start.mock.calls.length).toBe(once * 2);
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });
});

describe('code export audio', () => {
  const shippedAudio = (src) => JSON.parse(src.match(/^const SAMPLE_DATA = (.*);$/m)[1]);

  it('ships only the trimmed part of a clip', () => {
    samples.set('clip', { id: 'clip', name: 'Clip', sampleRate: 48000, channels: [new Float32Array(48000)] });
    const whole = { ...layerDefaults('sample'), sampleId: 'clip' };
    const trimmed = { ...whole, trimStart: 250, trimEnd: 500 };
    const size = (L) => shippedAudio(moduleSource({ ...blankPatch('Clip'), layers: [L] }, fakeRes)).clip.channels[0].length;
    expect(size(trimmed) / size(whole)).toBeCloseTo(0.25, 2);
  });
});

describe('readmes', () => {
  const tap = blankPatch('Tap');
  const set = [{ patch: tap, res: { duration: 0.12 }, base: 'tap' }];
  const ogg = { format: 'ogg', channels: 2, sampleRate: 48000, bits: 24 };

  it('describe Ogg Vorbis files for an OGG export', () => {
    const one = readme(tap, 'tap', { ...ogg, ms: 120 });
    expect(one).toContain('tap.ogg ');
    expect(one).toContain('Ogg Vorbis');
    expect(one).toContain('ffmpeg -i tap.ogg ');
    expect(one).not.toContain('-bit WAV');
    const many = setReadme(set, ogg, 'all');
    expect(many).toContain('ogg/ ');
    expect(many).toContain('Ogg Vorbis');
    expect(many).not.toContain('-bit WAV');
  });

  it('list the interactions and the credits a set carries', () => {
    const tap2 = blankPatch('Tap 2');
    const two = [...set, { patch: tap2, res: { duration: 0.1 }, base: 'tap-2' }];
    const text = setReadme(two, ogg, 'all', { roles: { tap: [tap.id, tap2.id], ring: [tap.id] }, loops: ['ring'], credits: ['Material Design product sounds by Google, CC BY 4.0.'] });
    expect(text).toContain('  tap            tap, tap-2\n');
    expect(text).toContain('  ring           tap  (repeats until stopped)');
    expect(text).toContain('Credits:\n  Material Design product sounds by Google, CC BY 4.0.\n  Trimmed and processed in');
    expect(readme(tap, 'tap', { ...ogg, ms: 120, credits: ['Kenney, CC0 1.0.'] })).toContain('Credits:\n  Kenney, CC0 1.0.');
    expect(setReadme(set, ogg, 'all')).not.toContain('Credits');
    expect(setReadme(set, ogg, 'all')).not.toContain('Interactions');
  });

  it('describe WAV files for a WAV export', () => {
    const wav = { ...ogg, format: 'wav' };
    expect(readme(tap, 'tap', { ...wav, ms: 120 })).toContain('tap.wav ');
    expect(readme(tap, 'tap', { ...wav, ms: 120 })).toContain('24-bit WAV');
    expect(setReadme(set, wav, 'audio')).toContain('24-bit WAV');
    expect(setReadme(set, wav, 'audio')).not.toContain('Ogg Vorbis');
  });
});
