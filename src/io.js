import { APP_SLUG } from './brand.js';
import { dbToGain } from './engine/engine.js';
import { encodeWav, makeZip, moduleSource, patchJson, readme, readPatchFile, setModuleSource, setReadme, slug } from './engine/export.js';
import { MAX_RENDER_MS, renderPatch } from './engine/render.js';
import { decodeToSample, loadSamples, pruneSamples, sampleDurationMs, storeSample } from './engine/samples.js';
import { addSampleLayer, addSound, bumpSamples, currentSound, setPref, showToast, useStore } from './store.js';

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
      addSampleLayer(s);
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

// Loads audio for sample layers and references saved in earlier visits, and deletes the rest.
export async function loadStoredSamples() {
  const s = useStore.getState();
  const ids = new Set();
  for (const p of s.ws.sounds) for (const L of p.layers) if (L.type === 'sample' && L.sampleId) ids.add(L.sampleId);
  for (const r of s.refs) ids.add(r.sampleId);
  await pruneIfOnlyTab(ids);
  if (await loadSamples([...ids])) bumpSamples();
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

export async function exportSound({ what, scope, name, channels, sampleRate, bits }) {
  const enc = new TextEncoder();
  const info = { channels, sampleRate, bits };
  if (scope === 'set') {
    const sounds = useStore.getState().ws.sounds;
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
      if (what === 'wav' || what === 'all') files.push({ name: `wav/${base}.wav`, data: encodeWav(chs, sampleRate, bits) });
      if (what === 'all' || what === 'project') files.push({ name: `projects/${base}.json`, data: enc.encode(patchJson(p)) });
    }
    if (what === 'code' || what === 'all') files.push({ name: 'sounds.js', data: enc.encode(setModuleSource(rendered)) });
    files.push({ name: 'README.txt', data: enc.encode(setReadme(rendered, info, what)) });
    const setName = slug(name || 'sound-set');
    download(`${setName}.zip`, makeZip(files), 'application/zip');
    return;
  }
  const patch = currentSound();
  const base = slug(name || patch.name);
  const { res, chs } = await renderForExport(patch, info);
  if (what === 'wav') return download(`${base}.wav`, encodeWav(chs, sampleRate, bits), 'audio/wav');
  if (what === 'code') return download(`${base}.js`, moduleSource(patch, res), 'text/javascript');
  if (what === 'project') return download(`${base}.json`, patchJson(patch), 'application/json');
  const zip = makeZip([
    { name: `${base}.wav`, data: encodeWav(chs, sampleRate, bits) },
    { name: `${base}.js`, data: enc.encode(moduleSource(patch, res)) },
    { name: `${base}.json`, data: enc.encode(patchJson(patch)) },
    { name: 'README.txt', data: enc.encode(readme(patch, base, { ...info, ms: Math.round(res.duration * 1000) })) },
  ]);
  download(`${base}.zip`, zip, 'application/zip');
}
