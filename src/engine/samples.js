// Decoded audio for sample layers. Kept outside React state (typed arrays are large) and
// persisted to IndexedDB so recordings survive a reload.

export const PREVIEW_SR = 48000;
const DB_NAME = 'ui-sound-samples';
const STORE = 'samples';

export const samples = new Map();

let opening = null;
const openDb = () =>
  opening ||
  (opening = new Promise((resolve, reject) => {
    try {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    } catch (e) {
      reject(e);
    }
  }));

async function idbPut(id, value) {
  try {
    const db = await openDb();
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, id);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  } catch {
    // Storage can be unavailable (private mode); the sample still works for this session.
  }
}

async function idbGet(id) {
  try {
    const db = await openDb();
    return await new Promise((res, rej) => {
      const rq = db.transaction(STORE).objectStore(STORE).get(id);
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
  } catch {
    return undefined;
  }
}

export function storeSample(sample) {
  samples.set(sample.id, sample);
  idbPut(sample.id, { name: sample.name, sampleRate: sample.sampleRate, channels: sample.channels });
}

export async function loadSamples(ids) {
  let loaded = 0;
  for (const id of ids) {
    if (samples.has(id)) continue;
    const v = await idbGet(id);
    if (v && v.channels && v.channels.length) {
      samples.set(id, { id, name: v.name, sampleRate: v.sampleRate, channels: v.channels });
      loaded += 1;
    }
  }
  return loaded;
}

export async function decodeToSample(arrayBuffer, name, id) {
  const oc = new OfflineAudioContext(1, 1, PREVIEW_SR);
  const buf = await oc.decodeAudioData(arrayBuffer);
  const channels = [];
  for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) {
    const d = new Float32Array(buf.getChannelData(c));
    // Float files can carry NaN or Infinity, which would poison every render that uses them.
    for (let i = 0; i < d.length; i++) if (!Number.isFinite(d[i])) d[i] = 0;
    channels.push(d);
  }
  return { id: id || `s-${Math.random().toString(36).slice(2, 10)}`, name, sampleRate: buf.sampleRate, channels };
}

// Deletes stored audio that no sound or comparison uses any more. It runs at startup, when the undo
// history is empty, so nothing an undo could bring back is lost.
export async function pruneSamples(keep) {
  try {
    const db = await openDb();
    const keys = await new Promise((res, rej) => {
      const rq = db.transaction(STORE).objectStore(STORE).getAllKeys();
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
    const unused = keys.filter((k) => !keep.has(k));
    if (!unused.length) return;
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      for (const k of unused) tx.objectStore(STORE).delete(k);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  } catch {
    // Storage can be unavailable (private mode); then there is nothing to clean up.
  }
}

// Where the sound actually starts, so recordings and files skip their leading silence.
export function detectOnsetMs(sample) {
  const d = sample.channels[0];
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  if (!peak) return 0;
  const thr = peak * 0.02;
  let i = 0;
  while (i < d.length && Math.abs(d[i]) < thr) i += 1;
  return Math.max(0, (i / sample.sampleRate) * 1000 - 2);
}

export const sampleDurationMs = (sample) => (sample.channels[0].length / sample.sampleRate) * 1000;

export function floatToB64(f32) {
  const bytes = new Uint8Array(f32.length * 2);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-32768, Math.min(32767, Math.round(f32[i] * 32767)));
    bytes[2 * i] = s & 255;
    bytes[2 * i + 1] = (s >> 8) & 255;
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function b64ToFloat(b64) {
  const bin = atob(b64);
  const out = new Float32Array(bin.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = (((bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)) << 16) >> 16) / 32768;
  return out;
}
