import engineSource from './engine.js?raw';
import { normalizePatch } from './model.js';
import { samples, floatToB64, b64ToFloat, storeSample } from './samples.js';
import { APP_NAME } from '../brand.js';

export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sound';

export function encodeWav(channels, sr, bits) {
  const nch = channels.length;
  const n = channels[0].length;
  const bps = bits / 8;
  const buf = new ArrayBuffer(44 + n * nch * bps);
  const v = new DataView(buf);
  const w = (o, s) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  w(0, 'RIFF');
  v.setUint32(4, 36 + n * nch * bps, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, nch, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * nch * bps, true);
  v.setUint16(32, nch * bps, true);
  v.setUint16(34, bits, true);
  w(36, 'data');
  v.setUint32(40, n * nch * bps, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nch; c++) {
      let s = Math.max(-1, Math.min(1, channels[c][i]));
      if (bits === 16) {
        s += (Math.random() - Math.random()) / 32768; // TPDF dither
        v.setInt16(o, Math.max(-32768, Math.min(32767, Math.round(s * 32767))), true);
        o += 2;
      } else {
        const x = Math.max(-8388608, Math.min(8388607, Math.round(s * 8388607)));
        v.setUint8(o, x & 255);
        v.setUint8(o + 1, (x >> 8) & 255);
        v.setUint8(o + 2, (x >> 16) & 255);
        o += 3;
      }
    }
  }
  return new Uint8Array(buf);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// A stored (uncompressed) zip. Audio barely compresses, so deflate isn't worth the code.
export function makeZip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = f.data;
    const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true);
    lh.setUint16(8, 0, true);
    lh.setUint16(10, time, true);
    lh.setUint16(12, date, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true);
    lh.setUint32(22, data.length, true);
    lh.setUint16(26, name.length, true);
    lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, time, true);
    ch.setUint16(14, date, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true);
    ch.setUint32(24, data.length, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

function usedSampleData(patch) {
  const data = {};
  for (const L of patch.layers) {
    if (L.type !== 'sample' || !L.sampleId || data[L.sampleId]) continue;
    const s = samples.get(L.sampleId);
    if (s) data[L.sampleId] = { name: s.name, sampleRate: s.sampleRate, channels: s.channels.map(floatToB64) };
  }
  return data;
}

function sampleDataLiteral(data, abbreviate) {
  const json = JSON.stringify(data);
  return abbreviate && json.length > 400 ? `{} /* ${Math.round(json.length / 1024)} KB of audio data, included when you export */` : json;
}

// Shared by the single-sound and sound-set modules: the engine plus a lazy sample decoder.
function runtimeSource() {
  return [
    engineSource.replace(/^export /gm, '').trim(),
    '',
    'let decodedSamples = null;',
    'function getSamples() {',
    '  if (decodedSamples) return decodedSamples;',
    '  decodedSamples = new Map();',
    '  for (const id of Object.keys(SAMPLE_DATA)) {',
    '    const s = SAMPLE_DATA[id];',
    '    const channels = s.channels.map((b64) => {',
    '      const bin = atob(b64);',
    '      const out = new Float32Array(bin.length / 2);',
    '      for (let i = 0; i < out.length; i++) out[i] = (((bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)) << 16) >> 16) / 32768;',
    '      return out;',
    '    });',
    '    decodedSamples.set(id, { sampleRate: s.sampleRate, channels });',
    '  }',
    '  return decodedSamples;',
    '}',
    '',
    'function play(sound, ctx, destination, when) {',
    '  const cents = sound.variation ? (Math.random() * 2 - 1) * sound.variation : 0;',
    '  const out = ctx.createGain();',
    '  out.gain.setValueAtTime(sound.gain, when);',
    '  out.gain.setValueAtTime(sound.gain, when + Math.max(0, sound.length - sound.fade));',
    '  out.gain.linearRampToValueAtTime(0, when + sound.length);',
    '  out.connect(destination);',
    '  scheduleSound(ctx, varyPatch(sound.patch, cents), when, out, { samples: getSamples() });',
    '  setTimeout(() => out.disconnect(), (when - ctx.currentTime + sound.length + 0.5) * 1000);',
    '}',
  ].join('\n');
}

const soundEntry = (patch, res) => ({
  name: patch.name,
  gain: res ? Number(res.gain.toPrecision(6)) : 1,
  length: res ? Number(res.duration.toFixed(4)) : 0.2,
  fade: patch.master.fade / 1000,
  variation: patch.master.variation || 0,
  patch,
});

export function moduleSource(patch, res, { abbreviateSamples = false } = {}) {
  return [
    `// ${patch.name}. Made with ${APP_NAME}.`,
    '// Plays the sound with the Web Audio API. No audio file needed.',
    "// Usage: import { playSound } from './this-file.js'; playSound(new AudioContext());",
    '',
    `const SOUND = ${JSON.stringify(soundEntry(patch, res), null, 2)};`,
    `const SAMPLE_DATA = ${sampleDataLiteral(usedSampleData(patch), abbreviateSamples)};`,
    '',
    runtimeSource(),
    '',
    'export function playSound(ctx, destination = ctx.destination, when = ctx.currentTime) {',
    '  play(SOUND, ctx, destination, when);',
    '}',
    '',
  ].join('\n');
}

// One module for a whole sound set: playSound('tap', ctx), playSound('success', ctx) and so on.
export function setModuleSource(rendered) {
  const sounds = {};
  const data = {};
  for (const { patch, res, base } of rendered) {
    let key = base;
    for (let i = 2; sounds[key]; i += 1) key = `${base}-${i}`;
    sounds[key] = soundEntry(patch, res);
    Object.assign(data, usedSampleData(patch));
  }
  const names = Object.keys(sounds);
  return [
    `// A sound set of ${names.length}. Made with ${APP_NAME}.`,
    '// Plays every sound with the Web Audio API. No audio files needed.',
    `// Usage: import { playSound } from './sounds.js'; playSound('${names[0] || 'name'}', new AudioContext());`,
    '',
    `const SOUNDS = ${JSON.stringify(sounds, null, 2)};`,
    `const SAMPLE_DATA = ${sampleDataLiteral(data, false)};`,
    '',
    runtimeSource(),
    '',
    'export const soundNames = Object.keys(SOUNDS);',
    '',
    'export function playSound(name, ctx, destination = ctx.destination, when = ctx.currentTime) {',
    '  const sound = SOUNDS[name];',
    "  if (!sound) throw new Error(`Unknown sound \"${name}\". Available: ${soundNames.join(', ')}`);",
    '  play(sound, ctx, destination, when);',
    '}',
    '',
  ].join('\n');
}

export function setReadme(rendered, info, what) {
  const lines = [`A sound set of ${rendered.length}. Made with ${APP_NAME} on ${new Date().toISOString().slice(0, 10)}.`, ''];
  if (what !== 'code') lines.push(`wav/        One ${info.channels === 1 ? 'mono' : 'stereo'} ${info.sampleRate} Hz, ${info.bits}-bit WAV per sound.`);
  if (what === 'code' || what === 'all') lines.push("sounds.js   Plays any sound by name with the Web Audio API: playSound('name', audioContext).");
  if (what === 'all' || what === 'project') lines.push(`projects/   The editable projects. Open them again in ${APP_NAME}.`);
  lines.push('', 'Sounds:');
  for (const { patch, res, base } of rendered) lines.push(`  ${base.padEnd(24)} ${Math.round(res.duration * 1000)} ms, peak ${patch.master.out} dBFS`);
  lines.push('');
  return lines.join('\n');
}

export function patchJson(patch) {
  return JSON.stringify({ format: 'earcue-project/1', app: APP_NAME, patch, samples: usedSampleData(patch) }, null, 2);
}

// Accepts a project file exported from this app and restores any embedded audio.
export function readPatchFile(text) {
  const obj = JSON.parse(text);
  const patch = normalizePatch(obj.patch || obj);
  if (!patch) throw new Error('not a patch');
  if (obj.samples && typeof obj.samples === 'object') {
    for (const id of Object.keys(obj.samples)) {
      const s = obj.samples[id];
      if (!s || !Array.isArray(s.channels)) continue;
      storeSample({ id, name: s.name || 'Audio', sampleRate: s.sampleRate || 48000, channels: s.channels.map(b64ToFloat) });
    }
  }
  return patch;
}

export function readme(patch, base, info) {
  return [
    patch.name,
    `Made with ${APP_NAME} on ${new Date().toISOString().slice(0, 10)}.`,
    '',
    `${base}.wav          ${info.channels === 1 ? 'Mono' : 'Stereo'}, ${info.sampleRate} Hz, ${info.bits}-bit. ${info.ms} ms, peak ${patch.master.out} dBFS.`,
    `${base}.js           Plays the same sound with the Web Audio API, with no audio file.`,
    `${base}.patch.json   The editable project. Open it again with Import in ${APP_NAME}.`,
    '',
    'Need a smaller file? Convert the WAV:',
    `  ffmpeg -i ${base}.wav -c:a libopus -b:a 64k ${base}.ogg`,
    `  ffmpeg -i ${base}.wav -c:a libmp3lame -q:a 2 ${base}.mp3`,
    'MP3 encoders can add a few milliseconds of silence at the start. For UI sounds, WAV or OGG keeps the timing tight.',
    '',
    patch.master.variation
      ? `Natural variation: up to ${patch.master.variation} cents per play. The .js file applies it for you; the WAV does not include it.`
      : 'Natural variation: off.',
    '',
  ].join('\n');
}
