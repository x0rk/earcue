import { create } from 'zustand';
import { produce } from 'immer';
import { APP_NAME, APP_SLUG } from './brand.js';
import {
  basicSounds,
  blankPatch,
  cleanName,
  cloneLayerFresh,
  layerDefaults,
  oppositePatch,
  MAX_LAYERS,
  MAX_NAME,
  normalizeLayer,
  normalizePatch,
  starterSounds,
  TYPE_LABEL,
  uid,
  uniqueName,
  variantBase,
  variantOf,
} from './engine/model.js';
import { familyOf } from './engine/family.js';
import { describeKey, normalizeKey, normalizeLoudness, retunePatch, ROOM_KEYS, STARTER_KEY, tierOf } from './engine/palette.js';
import { samplePitch } from './engine/pitch.js';
import { MAX_VARIANTS, normalizeRoles, ROLES, roleLabel, soundsForRole } from './engine/roles.js';
import { detectOnsetMs, loadSamples, sampleDurationMs, samples } from './engine/samples.js';
import { keyLabel } from './lib/keys.js';

// Each sound set is saved under its own key, so the home page can list sets without a separate index
// that two tabs could overwrite.
const SET_PREFIX = `${APP_SLUG}:set:`;
const SET_SUFFIX = ':v1';
const setKey = (id) => `${SET_PREFIX}${id}${SET_SUFFIX}`;
const META_KEY = `${APP_SLUG}:meta:v1`;
const LEGACY_WS_KEY = `${APP_SLUG}:workspace:v1`;
const PREFS_KEY = `${APP_SLUG}:prefs:v1`;
const STARTER_SET_NAME = 'Starter set';
const MIGRATED_SET_NAME = 'My sounds';
const NEW_SET_NAME = 'Untitled set';

// localStorage can be blocked (private mode) or full. Writes that fail are kept in memory, so the
// session keeps working; reads prefer that newer copy.
const memory = new Map();
const storage = {
  get(k) {
    if (memory.has(k)) return memory.get(k);
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
      memory.delete(k);
    } catch {
      memory.set(k, v);
    }
  },
  remove(k) {
    memory.delete(k);
    try {
      localStorage.removeItem(k);
    } catch {
      // Nothing stored, nothing to remove.
    }
  },
  keys() {
    let keys = [];
    try {
      keys = Object.keys(localStorage);
    } catch {
      // Blocked storage: only the in-memory copies exist.
    }
    return [...new Set([...keys, ...memory.keys()])];
  },
};

const readJson = (k) => {
  try {
    return JSON.parse(storage.get(k) || 'null');
  } catch {
    return null;
  }
};

function normalizeSet(raw, id) {
  if (!raw || !Array.isArray(raw.sounds)) return null;
  const sounds = raw.sounds.map(normalizePatch).filter(Boolean);
  if (!sounds.length) return null;
  const now = Date.now();
  return {
    id,
    name: (typeof raw.name === 'string' && cleanName(raw.name, MAX_NAME)) || NEW_SET_NAME,
    created: Number.isFinite(raw.created) ? raw.created : now,
    updated: Number.isFinite(raw.updated) ? raw.updated : now,
    sounds,
    current: sounds.some((x) => x.id === raw.current) ? raw.current : sounds[0].id,
    roles: normalizeRoles(raw.roles, sounds),
    key: normalizeKey(raw.key),
    loudness: normalizeLoudness(raw.loudness),
    credits: normalizeCredits(raw.credits),
  };
}

// Where a set's recordings came from, such as a bundled kit, so exports can keep the credit their
// licence asks for.
const MAX_CREDITS = 20;
const MAX_CREDIT = 300;
function normalizeCredits(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((c) => typeof c === 'string').map((c) => cleanName(c, MAX_CREDIT)).filter(Boolean))].slice(0, MAX_CREDITS);
}

export const readSet = (id) => normalizeSet(readJson(setKey(id)), id);

function writeSet(set, updated = Date.now()) {
  storage.set(setKey(set.id), JSON.stringify({ ...set, updated }));
}

const setIds = () => storage.keys().filter((k) => k.startsWith(SET_PREFIX) && k.endsWith(SET_SUFFIX)).map((k) => k.slice(SET_PREFIX.length, -SET_SUFFIX.length));

// What the home page shows for each set, most recently edited first.
export function listSets() {
  return setIds()
    .map(readSet)
    .filter(Boolean)
    .map(({ id, name, updated, sounds }) => ({ id, name, updated, sounds: sounds.map(({ id: soundId, name: soundName }) => ({ id: soundId, name: soundName })) }))
    .sort((a, b) => b.updated - a.updated);
}

// Every sample any saved set uses, so cleaning up stored audio never touches another set's recordings.
export function sampleIdsInSets() {
  const ids = new Set();
  for (const id of setIds()) for (const p of readSet(id)?.sounds || []) for (const L of p.layers) if (L.type === 'sample' && L.sampleId) ids.add(L.sampleId);
  return ids;
}

const newSet = (name, sounds, key = null, loudness = normalizeLoudness(), credits = []) => ({ id: uid(), name, created: Date.now(), sounds, current: sounds[0].id, roles: {}, key, loudness, credits });

// The first visit gets the starter set. A visit from before sets existed also keeps its old sound list
// as a set of its own.
function seedSets() {
  const meta = readJson(META_KEY) || {};
  if (meta.seeded) return;
  const legacy = normalizeSet(readJson(LEGACY_WS_KEY), uid());
  const now = Date.now();
  writeSet(newSet(STARTER_SET_NAME, starterSounds(), STARTER_KEY), now - 1);
  if (legacy) writeSet({ ...legacy, name: MIGRATED_SET_NAME }, now);
  storage.set(META_KEY, JSON.stringify({ ...meta, seeded: true }));
  if (legacy) storage.remove(LEGACY_WS_KEY);
}

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

const prefs = loadPrefs();
seedSets();
const firstLayer = (patch) => (patch.layers[0] ? { kind: 'layer', id: patch.layers[0].id } : { kind: 'output' });
const urlSetId = () => new URLSearchParams(window.location.search).get('set');
const initialSetId = urlSetId();
const initialSet = initialSetId ? readSet(initialSetId) : null;
const initialSound = initialSet && (initialSet.sounds.find((x) => x.id === initialSet.current) || initialSet.sounds[0]);
// A comparison with another sound only means something inside the set it was made in.
const compareFor = (set, compare) =>
  compare?.kind === 'ref' || (compare?.kind === 'sound' && set?.sounds.some((x) => x.id === compare.id && x.id !== set.current)) ? compare : null;

export const useStore = create(() => ({
  page: initialSet ? 'set' : 'home',
  sets: initialSet ? [] : listSets(),
  ws: initialSet,
  sel: initialSound ? firstLayer(initialSound) : { kind: 'output' },
  compare: compareFor(initialSet, prefs.compare),
  refs: Array.isArray(prefs.refs) ? prefs.refs : [],
  view: { start: 0, end: 300, auto: true },
  snap: prefs.snap ?? 1,
  loop: false,
  dock: ['spectrum', 'mixer', 'code', 'checks'].includes(prefs.dock) ? prefs.dock : 'spectrum',
  theme: prefs.theme ?? 'system',
  openMore: prefs.openMore ?? {},
  singleKeys: prefs.singleKeys ?? true,
  preview: ['split', 'full'].includes(prefs.preview) ? prefs.preview : 'off',
  previewWidth: Number.isFinite(prefs.previewWidth) ? prefs.previewWidth : 440,
  micId: typeof prefs.micId === 'string' ? prefs.micId : null,
  tipDone: prefs.tipDone === true,
  hint: null,
  clipboard: null,
  canUndo: false,
  canRedo: false,
  samplesVersion: 0,
  resultsVersion: 0,
  dialog: null,
  dialogArg: null,
  toast: null,
}));

const get = () => useStore.getState();
const set = (patch) => useStore.setState(patch);

export const currentSound = (s = get()) => s.ws.sounds.find((x) => x.id === s.ws.current) || s.ws.sounds[0];
export const selectedLayer = (s = get()) =>
  s.sel?.kind === 'layer' ? currentSound(s).layers.find((l) => l.id === s.sel.id) || null : null;

// ---------- persistence ----------
let saveTimer = 0;
function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  const ws = get().ws;
  if (ws) writeSet(ws);
}
function persistWorkspace() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 250);
}
// A pending save is written before the page goes away, so the last edit isn't lost.
export const flushSave = () => saveTimer && saveNow();
export function persistPrefs() {
  const s = get();
  try {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        compare: s.compare,
        refs: s.refs,
        snap: s.snap,
        dock: s.dock,
        theme: s.theme,
        openMore: s.openMore,
        singleKeys: s.singleKeys,
        preview: s.preview,
        previewWidth: s.previewWidth,
        micId: s.micId,
        tipDone: s.tipDone,
      }),
    );
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
  // Switching sounds is navigation, not an edit, so it stays out of undo and redo.
  set({ ws: { ...s.ws, current: id } });
  persistWorkspace();
  const cur = currentSound();
  const compare = s.compare?.kind === 'sound' && s.compare.id === id ? null : s.compare;
  set({ sel: firstLayer(cur), view: { ...s.view, auto: true }, compare });
  persistPrefs();
}

export function setCompare(compare) {
  setPref({ compare });
}

// Removes a comparison file from the list. Its stored audio is deleted the next time the app opens.
export function removeRef(id) {
  const s = get();
  setPref({ refs: s.refs.filter((r) => r.id !== id), compare: s.compare?.kind === 'ref' && s.compare.id === id ? null : s.compare });
}

// Loading keeps at most MAX_LAYERS layers, so adding past it would lose layers on the next reload.
function roomForLayer() {
  if (currentSound().layers.length < MAX_LAYERS) return true;
  showToast(`A sound can have up to ${MAX_LAYERS} layers.`);
  return false;
}

export function addLayer(type) {
  if (!roomForLayer()) return;
  const L = layerDefaults(type);
  editSound((P) => {
    L.name = uniqueName(TYPE_LABEL[type], P.layers.map((x) => x.name));
    P.layers.push(L);
  });
  set({ sel: { kind: 'layer', id: L.id } });
}

export function duplicateLayer(id) {
  if (!roomForLayer()) return;
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
  showToast(`Deleted ${name}. Press ${keyLabel('⌘Z')} to undo.`);
}

export function copyLayer(id) {
  const L = currentSound().layers.find((l) => l.id === id);
  if (!L) return;
  set({ clipboard: structuredClone(L) });
  showToast(`Copied ${L.name}.`);
}

export function pasteLayer() {
  const clip = get().clipboard;
  if (!clip || !roomForLayer()) return;
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

export function addOppositeSound(id) {
  const src = get().ws.sounds.find((x) => x.id === id);
  if (!src) return;
  const p = addSound(oppositePatch(src));
  showToast(`Made ${p.name}: ${src.name} with its notes and slides reversed.`);
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
  showToast(`Deleted ${name}. Press ${keyLabel('⌘Z')} to undo.`);
}

export function renameSound(id, name) {
  const clean = cleanName(name, MAX_NAME);
  if (!clean) return;
  edit((ws) => {
    const p = ws.sounds.find((x) => x.id === id);
    if (p) p.name = clean;
  });
}

export function addSampleLayer(sample, { autoTrim = true } = {}) {
  if (!roomForLayer()) return false;
  const L = layerDefaults('sample');
  L.sampleId = sample.id;
  L.sampleName = sample.name;
  if (autoTrim) L.trimStart = Math.round(detectOnsetMs(sample) * 10) / 10;
  editSound((P) => {
    L.name = uniqueName(sample.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40) || 'Audio', P.layers.map((x) => x.name));
    P.layers.push(L);
  });
  set({ sel: { kind: 'layer', id: L.id }, view: { ...get().view, auto: true }, samplesVersion: get().samplesVersion + 1 });
  return true;
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

export const openDialog = (dialog, dialogArg = null) => set({ dialog, dialogArg });
export const closeDialog = () => set({ dialog: null, dialogArg: null });

export function setView(view) {
  set({ view });
}

export function toggleOpenMore(key, open) {
  setPref({ openMore: { ...get().openMore, [key]: open } });
}

// ---------- sets ----------
const setUrl = (id) => (id ? `?set=${encodeURIComponent(id)}` : window.location.pathname);

function sampleIdsOf(set) {
  const ids = new Set();
  for (const p of set.sounds) for (const L of p.layers) if (L.type === 'sample' && L.sampleId) ids.add(L.sampleId);
  return [...ids];
}

// Each set keeps its own undo history while the page is open, so leaving a set and coming back can
// still undo what you did there.
const histories = new Map();

function stashHistory() {
  if (baseline) commit();
  const ws = get().ws;
  if (ws) histories.set(ws.id, { past: [...past], future: [...future] });
}

export function openSet(id, { push = true } = {}) {
  stashHistory();
  flushSave();
  const data = readSet(id);
  if (!data) {
    showToast("That set isn't saved in this browser.");
    goHome({ push: false, replace: true });
    return;
  }
  const kept = histories.get(id);
  past.length = 0;
  past.push(...(kept?.past || []));
  future = [...(kept?.future || [])];
  baseline = null;
  const sound = data.sounds.find((x) => x.id === data.current) || data.sounds[0];
  set({
    page: 'set',
    ws: data,
    sel: firstLayer(sound),
    view: { start: 0, end: 300, auto: true },
    compare: compareFor(data, get().compare),
    loop: false,
    dialog: null,
    dialogArg: null,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  });
  if (push) window.history.pushState(null, '', setUrl(id));
  loadSamples(sampleIdsOf(data)).then((n) => n && bumpSamples());
}

export function goHome({ push = true, replace = false } = {}) {
  stashHistory();
  flushSave();
  // The open set stays in memory until another one opens, so nothing that reads it ever sees an empty set.
  set({ page: 'home', sets: listSets(), loop: false, dialog: null, dialogArg: null });
  if (replace) window.history.replaceState(null, '', setUrl(null));
  else if (push) window.history.pushState(null, '', setUrl(null));
}

export const refreshSets = () => get().page === 'home' && set({ sets: listSets() });

// Back and forward move between the home page and sets, like links do.
export function followUrl() {
  const id = urlSetId();
  if (id) openSet(id, { push: false });
  else goHome({ push: false });
}

const setNames = () => listSets().map((x) => x.name);

const STARTS = { starter: starterSounds, basics: basicSounds, blank: () => [blankPatch('Untitled sound')] };

export function createSet(name, start) {
  const starter = start !== 'blank';
  const sounds = (STARTS[start] || STARTS.starter)();
  const created = newSet(uniqueName(cleanName(name, MAX_NAME) || NEW_SET_NAME, setNames()), sounds, starter ? STARTER_KEY : null);
  writeSet(created);
  openSet(created.id);
}

// A new set from exported projects, with fresh ids so it never shares sounds with the set it came from.
export function importSet(name, patches) {
  const sounds = patches.map((p) => ({ ...p, id: uid(), layers: p.layers.map(cloneLayerFresh) }));
  const created = newSet(uniqueName(cleanName(name, MAX_NAME) || NEW_SET_NAME, setNames()), sounds);
  writeSet(created);
  openSet(created.id);
  showToast(`Imported ${sounds.length} sound${sounds.length === 1 ? '' : 's'} as ${created.name}.`);
}

export function renameSet(id, name) {
  const clean = cleanName(name, MAX_NAME);
  if (!clean) return;
  const data = readSet(id);
  if (!data) return;
  writeSet({ ...data, name: clean });
  refreshSets();
}

export function duplicateSet(id) {
  const data = readSet(id);
  if (!data) return;
  // Fresh ids keep renders and comparisons of the two sets apart; the role choices follow the new ids.
  const sounds = data.sounds.map((p) => ({ ...p, id: uid(), layers: p.layers.map(cloneLayerFresh) }));
  const newId = new Map(data.sounds.map((p, i) => [p.id, sounds[i].id]));
  const roles = Object.fromEntries(Object.entries(data.roles).map(([role, ids]) => [role, ids && ids.map((id) => newId.get(id))]));
  const index = data.sounds.findIndex((x) => x.id === data.current);
  const copy = { ...newSet(uniqueName(`${data.name} copy`, setNames()), sounds, data.key, data.loudness, data.credits), current: sounds[Math.max(0, index)].id, roles };
  writeSet(copy);
  refreshSets();
  showToast(`Duplicated as ${copy.name}.`);
}

export function deleteSet(id) {
  const data = readSet(id);
  histories.delete(id);
  storage.remove(setKey(id));
  refreshSets();
  if (data) showToast(`Deleted ${data.name}.`);
}

export const setTitle = (s) => (s.page === 'set' && s.ws ? `${s.ws.name} · ${APP_NAME}` : APP_NAME);

const sampleMs = (id) => (samples.has(id) ? sampleDurationMs(samples.get(id)) : null);
const countOf = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// A set made from one sound: its eight interactions, keyed to the sound's own note. It opens straight away.
export function createSetFromSound(id) {
  const { ws } = get();
  const src = ws.sounds.find((x) => x.id === id);
  if (!src) return;
  const family = familyOf(src, { samplePitch, sampleMs, loudness: ws.loudness });
  if (!family) {
    showToast(`${src.name} has no layer you can hear, so there is nothing to build from.`);
    return;
  }
  // A family grown from a kit's recording still uses it, so it keeps the kit's credit.
  const created = newSet(uniqueName(`${src.name} family`, setNames()), family.sounds, family.key, ws.loudness, ws.credits);
  writeSet(created);
  openSet(created.id);
  showToast(family.key ? `Made ${created.name} from ${src.name}, in ${describeKey(family.key)}.` : `Made ${created.name} from ${src.name}. It has no clear pitch, so the set has no key.`);
}

// A set made from a bundled kit: its recordings, the interactions the kit's sounds were made for, and
// the credit its licence asks for. It opens straight away.
export function importKit(kit, sounds, roles, skipped = 0) {
  const created = { ...newSet(uniqueName(cleanName(kit.name, MAX_NAME), setNames()), sounds, null, normalizeLoudness(), [kit.credit]), roles: normalizeRoles(roles, sounds) };
  writeSet(created);
  openSet(created.id);
  showToast(
    skipped
      ? `Opened ${kit.name} as a set of ${countOf(sounds.length, 'sound')}. ${countOf(skipped, 'sound')} couldn't be loaded.`
      : `Opened ${kit.name} as a set of ${countOf(sounds.length, 'sound')}. Change them as you like; the kit stays as it was.`,
  );
}

// Another take on a sound, placed after the takes it already has. Interactions that were picked to
// play the sound pick between all its takes from now on; one undo removes it again.
export function addVariant(id) {
  const { ws } = get();
  const src = ws.sounds.find((x) => x.id === id);
  if (!src) return;
  const base = variantBase(src.name);
  const takes = ws.sounds.filter((x) => variantBase(x.name) === base);
  const p = normalizePatch(variantOf(src, takes.length));
  const after = ws.sounds.indexOf(takes.at(-1) || src);
  edit((draft) => {
    p.name = uniqueName(p.name, draft.sounds.map((x) => x.name));
    draft.sounds.splice(after + 1, 0, p);
    draft.current = p.id;
    for (const [role, ids] of Object.entries(draft.roles)) if (ids?.includes(src.id) && ids.length < MAX_VARIANTS) draft.roles[role] = [...ids, p.id];
  });
  set({ sel: firstLayer(p), view: { ...get().view, auto: true } });
  const plays = ROLES.filter((r) => soundsForRole(get().ws, r.id).some((x) => x.id === p.id)).map((r) => roleLabel(r.id));
  showToast(
    plays.length
      ? `Made ${p.name}, another take on ${src.name}. ${plays.join(', ')} now picks one of them at random.`
      : `Made ${p.name}, another take on ${src.name}. Pick both for an interaction in the preview to hear them in turn.`,
  );
}

// ---------- palette ----------
// The key the set's notes stay in, or null for none. With retune, every sound moves into the new key
// in the same undo step; without it, only what the checks compare against changes.
export function changeKey(key, { retune = true } = {}) {
  let moved = 0;
  edit((ws) => {
    if (retune && key) for (const p of ws.sounds) if (retunePatch(p, ws.key, key, samplePitch)) moved += 1;
    ws.key = key;
  });
  if (!key) showToast("The set has no key now, so its notes aren't checked.");
  else if (!retune) showToast(`Checking the notes against ${describeKey(key)}. No sound changed.`);
  else if (moved) showToast(`Moved ${countOf(moved, 'sound')} into ${describeKey(key)}. Press ${keyLabel('⌘Z')} to undo.`);
  else showToast(`The set is in ${describeKey(key)}. No note had to move.`);
}

// Gives each sound the loudness of its tier, from the interactions it plays for. A sound that plays
// for none keeps its own.
export function setLoudness(levels) {
  const loudness = normalizeLoudness(levels);
  let tiered = 0;
  let changed = 0;
  edit((ws) => {
    ws.loudness = loudness;
    for (const p of ws.sounds) {
      const tier = tierOf(ws, p.id);
      if (!tier) continue;
      tiered += 1;
      if (p.master.out === loudness[tier]) continue;
      p.master.out = loudness[tier];
      changed += 1;
    }
  });
  if (!tiered) showToast('No sound plays for an interaction yet. Pick them in the preview first.');
  else if (!changed) showToast('Every sound already has the loudness of its role.');
  else showToast(`Set the loudness of ${countOf(changed, 'sound')} by role. Press ${keyLabel('⌘Z')} to undo.`);
}

// Puts every sound in the same room as one of them. Each keeps how much of the room it uses.
export function shareRoom(soundId) {
  const src = get().ws.sounds.find((x) => x.id === soundId);
  if (!src) return;
  edit((ws) => {
    for (const p of ws.sounds) for (const k of ROOM_KEYS) p.master[k] = src.master[k];
  });
  showToast(`Every sound now uses the room from ${src.name}. Press ${keyLabel('⌘Z')} to undo.`);
}

// ---------- preview ----------
// Which sounds play for an interaction, one at random each time. null keeps it silent; undefined or an
// empty list goes back to matching by name.
export function setRole(roleId, soundIds) {
  edit((ws) => {
    ws.roles = { ...ws.roles, [roleId]: soundIds };
    if (soundIds === undefined || soundIds?.length === 0) delete ws.roles[roleId];
  });
}

export const setPreview = (preview) => setPref({ preview });
export const setPreviewWidth = (previewWidth) => setPref({ previewWidth: Math.round(previewWidth) });
