import { kitSampleId, kitSounds, normalizeKits } from './engine/kits.js';
import { decodeToSample, samples, storeSample } from './engine/samples.js';
import { playSample } from './playback.js';
import { importKit, showToast } from './store.js';

const BASE = import.meta.env.BASE_URL;
const kitUrl = (kit, file) => `${BASE}kits/${kit.id}/${file}`;
// Files fetched and decoded at once while a kit opens.
const BATCH = 8;

let index = null;
// The bundled kits, fetched once. A failed fetch is tried again next time.
export function loadKits() {
  index ||= fetch(`${BASE}kits/index.json`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
    .then(normalizeKits)
    .catch(() => {
      index = null;
      return [];
    });
  return index;
}

// Decoded once and kept for the session. Only a kit opened as a set stores its audio in the browser.
async function kitSample(kit, sound) {
  const id = kitSampleId(kit.id, sound.file);
  if (samples.has(id)) return samples.get(id);
  const res = await fetch(kitUrl(kit, sound.file));
  if (!res.ok) throw new Error(res.statusText);
  const sample = await decodeToSample(await res.arrayBuffer(), sound.file, id);
  samples.set(id, sample);
  return sample;
}

export async function playKitSound(kit, sound) {
  try {
    playSample(await kitSample(kit, sound));
  } catch {
    showToast(`Couldn't play ${sound.name}. This browser may not read OGG files.`);
  }
}

// Loads every sound in the kit and makes a set of them. onProgress(done, total) follows the loading.
export async function openKit(kit, onProgress) {
  const entries = [];
  for (let i = 0; i < kit.sounds.length; i += BATCH) {
    const got = await Promise.all(
      kit.sounds.slice(i, i + BATCH).map((sound) =>
        kitSample(kit, sound)
          .then((sample) => ({ sound, sample }))
          .catch(() => null),
      ),
    );
    entries.push(...got.filter(Boolean));
    onProgress?.(Math.min(kit.sounds.length, i + BATCH), kit.sounds.length);
  }
  if (!entries.length) {
    showToast(`Couldn't load ${kit.name}. Check your connection; some browsers can't read OGG files.`);
    return;
  }
  for (const { sample } of entries) storeSample(sample);
  const { sounds, roles } = kitSounds(kit, entries);
  importKit(kit, sounds, roles, kit.sounds.length - entries.length);
}
