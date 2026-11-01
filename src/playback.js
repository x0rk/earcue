import { renderPatch, renderWithLayers } from './engine/render.js';
import { layerDefaults, masterDefaults } from './engine/model.js';
import { PREVIEW_SR, samples, sampleToBufferSafe } from './engine/playable.js';
import { currentSound, showToast, useStore } from './store.js';

// Latest offline renders, keyed by sound id (or "ref:<id>" for reference audio).
export const results = new Map();

const refPatchCache = new Map();
function refPatch(ref, out) {
  const key = `${ref.id}:${out}`;
  if (!refPatchCache.has(key)) {
    refPatchCache.set(key, {
      id: `ref:${ref.id}`,
      name: ref.name,
      seed: 1,
      layers: [{ ...layerDefaults('sample'), id: 'ref-layer', name: ref.name, sampleId: ref.sampleId, fadeOut: 0 }],
      master: { ...masterDefaults(), out },
    });
  }
  return refPatchCache.get(key);
}

export function comparePatch(s = useStore.getState()) {
  const c = s.compare;
  if (!c) return null;
  if (c.kind === 'sound') return c.id === s.ws.current ? null : s.ws.sounds.find((x) => x.id === c.id) || null;
  const ref = s.refs.find((x) => x.id === c.id);
  if (!ref || !samples.has(ref.sampleId)) return null;
  return refPatch(ref, currentSound(s).master.out);
}

let timer = 0;
let token = 0;
export function scheduleRender() {
  clearTimeout(timer);
  timer = setTimeout(runRender, 30);
}

async function runRender() {
  const mine = ++token;
  const s = useStore.getState();
  const cur = currentSound(s);
  const cmp = comparePatch(s);
  try {
    const res = await renderWithLayers(cur, PREVIEW_SR);
    if (mine !== token) return;
    results.set(cur.id, res);
    if (cmp) {
      const rb = await renderPatch(cmp, PREVIEW_SR);
      if (mine !== token) return;
      results.set(cmp.id, rb);
    }
  } catch (e) {
    console.error(e);
    if (mine === token) showToast('That change could not be played. Try undoing it.');
    return;
  }
  useStore.setState({ resultsVersion: useStore.getState().resultsVersion + 1 });
}

export function startRenderLoop() {
  scheduleRender();
  return useStore.subscribe((s, prev) => {
    if (
      currentSound(s) !== currentSound(prev) ||
      s.compare !== prev.compare ||
      s.refs !== prev.refs ||
      s.samplesVersion !== prev.samplesVersion ||
      (s.compare?.kind === 'sound' && s.ws.sounds !== prev.ws.sounds)
    ) {
      scheduleRender();
    }
  });
}

// ---------- realtime playback ----------
let ctx = null;
export function audioCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      showToast('This browser does not support Web Audio.');
      return null;
    }
    ctx = new AC({ latencyHint: 'interactive' });
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  return ctx;
}

export const outputLatency = () => (ctx ? (ctx.outputLatency || 0) + (ctx.baseLatency || 0) : 0);

const bufferCache = new WeakMap();
function toBuffer(c, res) {
  const hit = bufferCache.get(res);
  if (hit && hit.ctx === c) return hit.buf;
  const buf = c.createBuffer(2, res.channels[0].length, res.sr);
  buf.copyToChannel(res.channels[0], 0);
  buf.copyToChannel(res.channels[1], 1);
  bufferCache.set(res, { ctx: c, buf });
  return buf;
}

const listeners = new Set();
export function onPlay(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function playResult(res, { when, track = false, variation = 0 } = {}) {
  const c = audioCtx();
  if (!c || !res) return null;
  const src = c.createBufferSource();
  src.buffer = toBuffer(c, res);
  const cents = variation ? (Math.random() * 2 - 1) * variation : 0;
  src.playbackRate.value = Math.pow(2, cents / 1200);
  src.connect(c.destination);
  const t0 = Math.max(c.currentTime + 0.005, when ?? c.currentTime + 0.01);
  src.start(t0);
  if (track) {
    const event = { t0, durMs: (res.duration * 1000) / src.playbackRate.value, ctx: c };
    listeners.forEach((fn) => fn(event));
  }
  return { t0 };
}

export function playCurrent() {
  const cur = currentSound();
  playResult(results.get(cur.id), { track: true, variation: cur.master.variation });
}

export function playCompare() {
  const p = comparePatch();
  if (!p) {
    showToast('Pick a sound or audio file to compare with first.');
    return;
  }
  playResult(results.get(p.id));
}

export function playSample(sample) {
  const c = audioCtx();
  if (!c || !sample) return;
  const s = c.createBufferSource();
  s.buffer = sampleToBufferSafe(c, sample);
  s.connect(c.destination);
  s.start();
}

let loopTimer = 0;
function loopTick() {
  if (!useStore.getState().loop) return;
  playCurrent();
  const res = results.get(currentSound().id);
  loopTimer = setTimeout(loopTick, Math.max(500, (res ? res.duration * 1000 : 200) + 450));
}
export function setLoop(on) {
  useStore.setState({ loop: on });
  clearTimeout(loopTimer);
  if (on) loopTick();
}

// Renders and plays any patch once, for template previews.
export async function previewPatch(patch) {
  const res = await renderPatch(patch, PREVIEW_SR);
  playResult(res, { variation: patch.master.variation });
}
