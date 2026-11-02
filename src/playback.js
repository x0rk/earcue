import { renderPatch, renderWithLayers } from './engine/render.js';
import { layerDefaults, masterDefaults } from './engine/model.js';
import { ROLE_IDS, SCENE, soundsForRole } from './engine/roles.js';
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
  if (s.page !== 'set') return;
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
  results.clear();
  scheduleRender();
  return useStore.subscribe((s, prev) => {
    if (s.page !== 'set') return;
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

// ---------- preview ----------
// Renders kept per sound and redone only after the sound or its audio changes, so the preview plays
// a click at once and the set checks only re-render what changed.
const roleRenders = new Map();
export function renderCached(patch) {
  const version = useStore.getState().samplesVersion;
  const hit = roleRenders.get(patch.id);
  if (hit?.patch === patch && hit.version === version) return hit.promise;
  const promise = renderPatch(patch, PREVIEW_SR);
  roleRenders.set(patch.id, { patch, version, promise });
  return promise;
}

export function warmRoles() {
  const ws = useStore.getState().ws;
  for (const id of ROLE_IDS) for (const sound of soundsForRole(ws, id)) renderCached(sound).catch(() => {});
}

// One of an interaction's variants at random, never the one it played last time, so a sound heard
// over and over never repeats exactly.
const lastVariant = new Map();
function pickVariant(roleId, sounds) {
  if (sounds.length < 2) return sounds[0] || null;
  const fresh = sounds.filter((s) => s.id !== lastVariant.get(roleId));
  const sound = fresh[Math.floor(Math.random() * fresh.length)];
  lastVariant.set(roleId, sound.id);
  return sound;
}

const roleListeners = new Set();
export function onRolePlayed(fn) {
  roleListeners.add(fn);
  return () => roleListeners.delete(fn);
}

// Plays one of the interaction's sounds and resolves to how long it lasts, in seconds (0 for silence).
export async function playRole(roleId) {
  const sound = pickVariant(roleId, soundsForRole(useStore.getState().ws, roleId));
  roleListeners.forEach((fn) => fn({ roleId, sound }));
  if (!sound) return 0;
  try {
    const res = await renderCached(sound);
    playResult(res, { variation: sound.master.variation });
    return res.duration;
  } catch (e) {
    console.error(e);
    return 0;
  }
}

// The pause between two cycles of a looping interaction, such as a ring.
const LOOP_GAP_S = 0.8;
const SILENT_LOOP_S = 1;

// Plays an interaction again and again, as a phone rings, until the returned function is called.
export function loopRole(roleId) {
  let timer = 0;
  let stopped = false;
  const cycle = async () => {
    const seconds = await playRole(roleId);
    if (!stopped) timer = setTimeout(cycle, ((seconds || SILENT_LOOP_S) + LOOP_GAP_S) * 1000);
  };
  cycle();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

const SCENE_GAP_S = 0.35;
// Plays tap, send, receive and success one after another, the way a user hears them in a flow.
export async function playScene() {
  const c = audioCtx();
  if (!c) return;
  const ws = useStore.getState().ws;
  const steps = SCENE.map((roleId) => ({ roleId, sound: pickVariant(roleId, soundsForRole(ws, roleId)) })).filter((x) => x.sound);
  if (!steps.length) {
    showToast('Pick sounds for tap, send, receive or success to hear the scene.');
    return;
  }
  const renders = await Promise.all(steps.map((x) => renderCached(x.sound)));
  let t = c.currentTime + 0.05;
  steps.forEach((step, i) => {
    playResult(renders[i], { when: t, variation: step.sound.master.variation });
    setTimeout(() => roleListeners.forEach((fn) => fn(step)), (t - c.currentTime) * 1000);
    t += Math.max(renders[i].duration, 0.15) + SCENE_GAP_S;
  });
}
