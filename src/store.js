import { create } from 'zustand';
import { produce } from 'immer';
import { APP_SLUG } from './brand.js';
import {
  blankPatch,
  cloneLayerFresh,
  layerDefaults,
  normalizeLayer,
  normalizePatch,
  presets,
  TYPE_LABEL,
  uid,
  uniqueName,
} from './engine/model.js';
import { detectOnsetMs } from './engine/samples.js';

const WS_KEY = `${APP_SLUG}:workspace:v1`;
const PREFS_KEY = `${APP_SLUG}:prefs:v1`;

function defaultWorkspace() {
  const sounds = presets();
  return { sounds, current: sounds[0].id };
}

function loadWorkspace() {
  try {
    const raw = JSON.parse(localStorage.getItem(WS_KEY) || 'null');
    if (raw && Array.isArray(raw.sounds)) {
      const sounds = raw.sounds.map(normalizePatch).filter(Boolean);
      if (sounds.length) return { sounds, current: sounds.some((s) => s.id === raw.current) ? raw.current : sounds[0].id };
    }
  } catch {
    // Corrupt or blocked storage: start from the templates.
  }
  return defaultWorkspace();
}

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

const prefs = loadPrefs();
const initialWs = loadWorkspace();
const firstLayer = (patch) => (patch.layers[0] ? { kind: 'layer', id: patch.layers[0].id } : { kind: 'output' });

export const useStore = create(() => ({
  ws: initialWs,
  sel: firstLayer(initialWs.sounds.find((s) => s.id === initialWs.current) || initialWs.sounds[0]),
  compare: prefs.compare ?? { kind: 'sound', id: initialWs.sounds[3]?.id },
  refs: Array.isArray(prefs.refs) ? prefs.refs : [],
  view: { start: 0, end: 300, auto: true },
  snap: prefs.snap ?? 1,
  loop: false,
  dock: ['spectrum', 'mixer', 'code'].includes(prefs.dock) ? prefs.dock : 'spectrum',
  theme: prefs.theme ?? 'system',
  openMore: prefs.openMore ?? {},
  hint: null,
  clipboard: null,
  canUndo: false,
  canRedo: false,
  samplesVersion: 0,
  resultsVersion: 0,
  dialog: null,
  toast: null,
}));

const get = () => useStore.getState();
const set = (patch) => useStore.setState(patch);

export const currentSound = (s = get()) => s.ws.sounds.find((x) => x.id === s.ws.current) || s.ws.sounds[0];
export const selectedLayer = (s = get()) =>
  s.sel?.kind === 'layer' ? currentSound(s).layers.find((l) => l.id === s.sel.id) || null : null;

// ---------- persistence ----------
let saveTimer = 0;
function persistWorkspace() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(WS_KEY, JSON.stringify(get().ws));
    } catch {
      // Storage full or blocked; work continues in memory.
    }
  }, 250);
}
export function persistPrefs() {
  const s = get();
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ compare: s.compare, refs: s.refs, snap: s.snap, dock: s.dock, theme: s.theme, openMore: s.openMore }));
  } catch {
    // Preferences are a convenience only.
  }
}
export function setPref(patch) {
  set(patch);
  persistPrefs();
}

// ---------- history ----------
// Edits during a drag call edit(..., false); the drag end calls commit() once,
// so a whole gesture is one undo step.
const past = [];
let future = [];
let baseline = null;

export function edit(recipe, shouldCommit = true) {
  const ws = get().ws;
  if (!baseline) baseline = ws;
  set({ ws: produce(ws, recipe) });
  if (shouldCommit) commit();
}

export function commit() {
  const ws = get().ws;
  if (baseline && baseline !== ws) {
    past.push(baseline);
    if (past.length > 200) past.shift();
    future = [];
  }
  baseline = null;
  persistWorkspace();
  set({ canUndo: past.length > 0, canRedo: future.length > 0 });
}

function restore(ws) {
  const s = get();
  const cur = ws.sounds.find((x) => x.id === ws.current) || ws.sounds[0];
  const selOk = s.sel?.kind === 'layer' ? cur.layers.some((l) => l.id === s.sel.id) : true;
  set({ ws, sel: selOk ? s.sel : firstLayer(cur), canUndo: past.length > 0, canRedo: future.length > 0 });
  persistWorkspace();
}

export function undo() {
  if (baseline) commit();
  if (!past.length) return;
  future.push(get().ws);
  restore(past.pop());
}

export function redo() {
  if (!future.length) return;
  past.push(get().ws);
  restore(future.pop());
}

// ---------- edit helpers ----------
const curDraft = (ws) => ws.sounds.find((x) => x.id === ws.current) || ws.sounds[0];

export const editSound = (fn, shouldCommit = true) => edit((ws) => fn(curDraft(ws)), shouldCommit);
export const editMaster = (fn, shouldCommit = true) => edit((ws) => fn(curDraft(ws).master), shouldCommit);
export const editLayer = (id, fn, shouldCommit = true) =>
  edit((ws) => {
    const L = curDraft(ws).layers.find((l) => l.id === id);
    if (L) fn(L);
  }, shouldCommit);

// ---------- actions ----------
export function select(sel) {
  set({ sel });
}

export function selectSound(id) {
  const s = get();
  if (id === s.ws.current) return;
  edit((ws) => {
    ws.current = id;
  });
  const cur = currentSound();
  const compare = s.compare?.kind === 'sound' && s.compare.id === id ? null : s.compare;
  set({ sel: firstLayer(cur), view: { ...s.view, auto: true }, compare });
  persistPrefs();
}

export function setCompare(compare) {
  setPref({ compare });
}

export function addLayer(type) {
  const L = layerDefaults(type);
  editSound((P) => {
    L.name = uniqueName(TYPE_LABEL[type], P.layers.map((x) => x.name));
    P.layers.push(L);
  });
  set({ sel: { kind: 'layer', id: L.id } });
}

export function duplicateLayer(id) {
  const P = currentSound();
  const src = P.layers.find((l) => l.id === id);
  if (!src) return;
  const copy = cloneLayerFresh(src);
  copy.name = uniqueName(`${src.name} copy`, P.layers.map((x) => x.name));
  editSound((d) => {
    d.layers.splice(d.layers.findIndex((l) => l.id === id) + 1, 0, copy);
  });
  set({ sel: { kind: 'layer', id: copy.id } });
}

export function deleteLayer(id) {
  const P = currentSound();
  const i = P.layers.findIndex((l) => l.id === id);
  if (i < 0) return;
  const name = P.layers[i].name;
  editSound((d) => {
    d.layers.splice(i, 1);
  });
  const next = currentSound().layers[Math.min(i, currentSound().layers.length - 1)];
  set({ sel: next ? { kind: 'layer', id: next.id } : { kind: 'output' } });
  showToast(`Deleted ${name}. Press ⌘Z to undo.`);
}

export function copyLayer(id) {
  const L = currentSound().layers.find((l) => l.id === id);
  if (!L) return;
  set({ clipboard: structuredClone(L) });
  showToast(`Copied ${L.name}.`);
}

export function pasteLayer() {
  const clip = get().clipboard;
  if (!clip) return;
  const L = normalizeLayer(structuredClone(clip));
  if (!L) return;
  L.id = uid();
  editSound((P) => {
    L.name = uniqueName(L.name, P.layers.map((x) => x.name));
    P.layers.push(L);
  });
  set({ sel: { kind: 'layer', id: L.id } });
  showToast(`Pasted ${L.name}.`);
}

export function moveLayer(id, dir) {
  editSound((P) => {
    const i = P.layers.findIndex((l) => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= P.layers.length) return;
    const [L] = P.layers.splice(i, 1);
    P.layers.splice(j, 0, L);
  });
}

export function addSound(patch) {
  const p = normalizePatch(structuredClone(patch));
  p.id = uid();
  p.layers.forEach((L) => {
    L.id = uid();
  });
  edit((ws) => {
    p.name = uniqueName(p.name, ws.sounds.map((x) => x.name));
    ws.sounds.push(p);
    ws.current = p.id;
  });
  set({ sel: firstLayer(p), view: { ...get().view, auto: true } });
  return p;
}

export const newBlankSound = () => addSound(blankPatch('Untitled sound'));

export function duplicateSound(id) {
  const src = get().ws.sounds.find((x) => x.id === id);
  if (!src) return;
  const p = addSound({ ...src, name: `${src.name} copy` });
  showToast(`Duplicated as ${p.name}.`);
}

export function deleteSound(id) {
  const s = get();
  if (s.ws.sounds.length < 2) return;
  const i = s.ws.sounds.findIndex((x) => x.id === id);
  const name = s.ws.sounds[i].name;
  edit((ws) => {
    ws.sounds.splice(i, 1);
    if (ws.current === id) ws.current = ws.sounds[Math.max(0, i - 1)].id;
  });
  set({ sel: firstLayer(currentSound()), view: { ...get().view, auto: true } });
  if (s.compare?.kind === 'sound' && s.compare.id === id) setCompare(null);
  showToast(`Deleted ${name}. Press ⌘Z to undo.`);
}

export function renameSound(id, name) {
  edit((ws) => {
    const p = ws.sounds.find((x) => x.id === id);
    if (p && name.trim()) p.name = name.trim().slice(0, 60);
  });
}

export function restoreTemplates() {
  const names = get().ws.sounds.map((s) => s.name);
  const missing = presets().filter((p) => !names.includes(p.name));
  if (!missing.length) {
    showToast('All templates are already in your list.');
    return;
  }
  edit((ws) => {
    ws.sounds.push(...missing);
  });
  showToast(`Added ${missing.length} template${missing.length > 1 ? 's' : ''}.`);
}

export function addSampleLayer(sample, { autoTrim = true } = {}) {
  const L = layerDefaults('sample');
  L.sampleId = sample.id;
  L.sampleName = sample.name;
  if (autoTrim) L.trimStart = Math.round(detectOnsetMs(sample) * 10) / 10;
  editSound((P) => {
    L.name = uniqueName(sample.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40) || 'Audio', P.layers.map((x) => x.name));
    P.layers.push(L);
  });
  set({ sel: { kind: 'layer', id: L.id }, view: { ...get().view, auto: true }, samplesVersion: get().samplesVersion + 1 });
}

export function bumpSamples() {
  set({ samplesVersion: get().samplesVersion + 1 });
}

export function setHint(hint) {
  if (get().hint !== hint) set({ hint });
}

let toastTimer = 0;
export function showToast(text) {
  clearTimeout(toastTimer);
  set({ toast: { text, id: Math.random() } });
  toastTimer = setTimeout(() => set({ toast: null }), 2800);
}

export const openDialog = (dialog) => set({ dialog });
export const closeDialog = () => set({ dialog: null });

export function setView(view) {
  set({ view });
}

export function toggleOpenMore(key, open) {
  setPref({ openMore: { ...get().openMore, [key]: open } });
}
