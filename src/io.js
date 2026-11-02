import { APP_SLUG } from './brand.js';
import { dbToGain } from './engine/engine.js';
import { encodeWav, makeZip, moduleSource, patchJson, readme, readPatchFile, setModuleSource, setReadme, slug } from './engine/export.js';
import { MAX_RENDER_MS, renderPatch } from './engine/render.js';
import { ROLES, soundsForRole } from './engine/roles.js';
import { decodeToSample, loadSamples, pruneSamples, sampleDurationMs, storeSample } from './engine/samples.js';
import { addSampleLayer, addSound, bumpSamples, currentSound, importSet, sampleIdsInSets, setPref, showToast, useStore } from './store.js';

const AUDIO_EXT = /\.(wav|mp3|ogg|oga|m4a|aac|aif|aiff|flac|webm|opus)$/i;
export const isAudioFile = (f) => /^audio\//.test(f.type) || AUDIO_EXT.test(f.name);

function pickFiles(accept, multiple, onPick) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.multiple = multiple;
  input.onchange = () => onPick([...(input.files || [])]);
  input.click();
}

export async function importAudioFiles(files) {
  for (const f of files) {
    try {
      const s = await decodeToSample(await f.arrayBuffer(), f.name);
      storeSample(s);
      if (!addSampleLayer(s)) return;
      showToast(
        sampleDurationMs(s) > MAX_RENDER_MS
          ? `Added ${f.name}. Only the first ${MAX_RENDER_MS / 1000} seconds of a sound play, so trim it to the part you need.`
          : `Added ${f.name} as a layer.`,
      );
    } catch {
      showToast(`Couldn't read ${f.name}. Try a WAV, MP3, OGG or M4A file.`);
    }
  }
}

export async function importReference(file) {
  try {
    const s = await decodeToSample(await file.arrayBuffer(), file.name);
    storeSample(s);
    const ref = { id: `r-${s.id}`, name: file.name, sampleId: s.id };
    setPref({ refs: [...useStore.getState().refs, ref], compare: { kind: 'ref', id: ref.id } });
    bumpSamples();
    showToast(`Comparing with ${file.name}.`);
  } catch {
    showToast(`Couldn't read ${file.name}.`);
  }
}

export async function importProjectFile(file) {
  try {
    const patch = readPatchFile(await file.text());
    const added = addSound(patch);
    bumpSamples();
    showToast(`Opened ${added.name}.`);
  } catch {
    showToast("That file isn't a project exported from this app.");
  }
}

const ZIP_END = 0x06054b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_STORED = 0;
const ZIP_DEFLATED = 8;

// Reads the files in a zip through its central directory. Earcue's own zips are stored uncompressed;
// a zip someone re-made with a system tool is usually deflated, which the browser can inflate.
export async function readZip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && v.getUint32(end, true) !== ZIP_END) end -= 1;
  if (end < 0) throw new Error('not a zip');
  const count = v.getUint16(end + 10, true);
  let p = v.getUint32(end + 16, true);
  const files = [];
  for (let i = 0; i < count; i++) {
    if (v.getUint32(p, true) !== ZIP_CENTRAL) throw new Error('bad zip');
    const method = v.getUint16(p + 10, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const local = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + size);
    if (method === ZIP_STORED) files.push({ name, data: raw });
    else if (method === ZIP_DEFLATED) files.push({ name, data: new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()) });
  }
  return files;
}

// Makes a new set from an exported set's zip, or from project files picked together.
export async function importSetFiles(files) {
  const patches = [];
  let name = '';
  for (const f of files) {
    try {
      if (/\.zip$/i.test(f.name)) {
        name ||= f.name.replace(/\.zip$/i, '');
        for (const entry of await readZip(new Uint8Array(await f.arrayBuffer()))) {
          if (!/\.json$/i.test(entry.name) || /(^|\/)(__MACOSX|\.)/.test(entry.name)) continue;
          try {
            patches.push(readPatchFile(new TextDecoder().decode(entry.data)));
          } catch {
            // A JSON file that isn't a project, such as a package manifest, is skipped.
          }
        }
      } else patches.push(readPatchFile(await f.text()));
    } catch {
      showToast(`Couldn't read ${f.name}.`);
      return;
    }
  }
  if (!patches.length) {
    showToast('No projects found. Export a set with Project or Everything, then import its zip.');
    return;
  }
  importSet(name || 'Imported sounds', patches);
}

export const pickSetFiles = () => pickFiles('.zip,.json,application/zip,application/json', true, (files) => files.length && importSetFiles(files));

export const pickAudioFiles = () => pickFiles('audio/*,.wav,.mp3,.ogg,.m4a,.aif,.aiff,.flac,.webm', true, importAudioFiles);
export const pickReferenceFile = () => pickFiles('audio/*,.wav,.mp3,.ogg,.m4a,.aif,.aiff,.flac,.webm', false, (files) => files[0] && importReference(files[0]));
export const pickProjectFile = () => pickFiles('.json,application/json', false, (files) => files[0] && importProjectFile(files[0]));

export function handleDroppedFiles(files) {
  const audio = files.filter(isAudioFile);
  const projects = files.filter((f) => /\.json$/i.test(f.name));
  if (audio.length) importAudioFiles(audio);
  projects.forEach(importProjectFile);
  if (!audio.length && !projects.length) showToast('Drop an audio file or an exported project (.json).');
}

// Every open tab holds this lock in shared mode. Another tab may be using audio that isn't in this
// tab's copy of the workspace, so stored audio is only cleaned up when no other tab holds it.
const TABS_LOCK = `${APP_SLUG}:open-tabs`;

async function pruneIfOnlyTab(keep) {
  if (!navigator.locks) return;
  await navigator.locks.request(TABS_LOCK, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
    if (lock) await pruneSamples(keep);
  });
  navigator.locks.request(TABS_LOCK, { mode: 'shared' }, () => new Promise(() => {}));
}

// Deletes stored audio that no saved set or comparison uses any more, then loads what the open set
// and the comparison list need. Sets opened later load their own audio.
export async function loadStoredSamples() {
  const s = useStore.getState();
  const keep = sampleIdsInSets();
  for (const r of s.refs) keep.add(r.sampleId);
  await pruneIfOnlyTab(keep);
  const ids = s.refs.map((r) => r.sampleId);
  if (s.ws) for (const p of s.ws.sounds) for (const L of p.layers) if (L.type === 'sample' && L.sampleId) ids.push(L.sampleId);
  if (await loadSamples(ids)) bumpSamples();
}

export function download(filename, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function renderForExport(patch, { channels, sampleRate }) {
  const res = await renderPatch(patch, sampleRate);
  if (channels === 2) return { res, chs: res.channels };
  // Mono: fold to one channel and re-normalize so the peak still hits the target.
  const mono = new Float32Array(res.mono);
  let peak = 0;
  for (let i = 0; i < mono.length; i++) peak = Math.max(peak, Math.abs(mono[i]));
  const g = peak ? dbToGain(patch.master.out) / peak : 1;
  for (let i = 0; i < mono.length; i++) mono[i] *= g;
  return { res, chs: [mono] };
}

const AUDIO_TYPE = { wav: 'audio/wav', ogg: 'audio/ogg' };

async function encodeAudio(chs, { format, sampleRate, bits }) {
  if (format !== 'ogg') return encodeWav(chs, sampleRate, bits);
  const { encodeOgg } = await import('./engine/ogg.js');
  return encodeOgg(chs, sampleRate);
}

export async function exportSound({ what, scope, name, format, channels, sampleRate, bits }) {
  const enc = new TextEncoder();
  const { ws } = useStore.getState();
  const info = { format, channels, sampleRate, bits, credits: ws.credits };
  if (scope === 'set') {
    const { sounds } = ws;
    const roles = Object.fromEntries(ROLES.map((r) => [r.id, soundsForRole(ws, r.id).map((s) => s.id)]).filter(([, ids]) => ids.length));
    const loops = ROLES.filter((r) => r.loop).map((r) => r.id);
    const files = [];
    const rendered = [];
    const used = new Set();
    for (const p of sounds) {
      const { res, chs } = await renderForExport(p, info);
      // Two sounds can share a name, so file names get "-2", "-3" instead of overwriting each other.
      let base = slug(p.name);
      for (let i = 2; used.has(base); i += 1) base = `${slug(p.name)}-${i}`;
      used.add(base);
      rendered.push({ patch: p, res, base });
      if (what === 'audio' || what === 'all') files.push({ name: `${format}/${base}.${format}`, data: await encodeAudio(chs, info) });
      if (what === 'all' || what === 'project') files.push({ name: `projects/${base}.json`, data: enc.encode(patchJson(p)) });
    }
    if (what === 'code' || what === 'all') files.push({ name: 'sounds.js', data: enc.encode(setModuleSource(rendered, { roles })) });
    files.push({ name: 'README.txt', data: enc.encode(setReadme(rendered, info, what, { roles, loops, credits: ws.credits })) });
    const setName = slug(name || 'sound-set');
    download(`${setName}.zip`, makeZip(files), 'application/zip');
    return;
  }
  const patch = currentSound();
  const base = slug(name || patch.name);
  const { res, chs } = await renderForExport(patch, info);
  if (what === 'audio') return download(`${base}.${format}`, await encodeAudio(chs, info), AUDIO_TYPE[format]);
  if (what === 'code') return download(`${base}.js`, moduleSource(patch, res), 'text/javascript');
  if (what === 'project') return download(`${base}.json`, patchJson(patch), 'application/json');
  const zip = makeZip([
    { name: `${base}.${format}`, data: await encodeAudio(chs, info) },
    { name: `${base}.js`, data: enc.encode(moduleSource(patch, res)) },
    { name: `${base}.json`, data: enc.encode(patchJson(patch)) },
    { name: 'README.txt', data: enc.encode(readme(patch, base, { ...info, ms: Math.round(res.duration * 1000) })) },
  ]);
  download(`${base}.zip`, zip, 'application/zip');
}
