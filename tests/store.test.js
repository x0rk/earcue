// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blankPatch, layerDefaults, LOUDNESS, starterSounds } from '../src/engine/model.js';
import { midiOf } from '../src/engine/palette.js';

const setKey = (id) => `earcue:set:${id}:v1`;
const META_KEY = 'earcue:meta:v1';
const LEGACY_KEY = 'earcue:workspace:v1';
const STARTER_NAMES = starterSounds().map((p) => p.name);
const BASIC_NAMES = ['Tap', 'Toggle on', 'Toggle off', 'Send', 'Receive', 'Success', 'Error', 'Notification'];
const STARTER_KEY = { root: 10, scale: 'major-pentatonic' };
const C_PENT = { root: 0, scale: 'major-pentatonic' };

// store.js seeds storage and reads the URL as it loads, so each test sets both up and imports a fresh copy.
async function reloadStore(url = '/') {
  window.history.replaceState(null, '', url);
  vi.resetModules();
  return import('../src/store.js');
}

async function freshStore({ url, saved = {} } = {}) {
  localStorage.clear();
  for (const [key, value] of Object.entries(saved)) localStorage.setItem(key, JSON.stringify(value));
  return reloadStore(url);
}

async function openStarter() {
  const store = await freshStore();
  store.openSet(store.listSets()[0].id);
  return store;
}

const state = (store) => store.useStore.getState();
const allIds = (set) => set.sounds.flatMap((p) => [p.id, ...p.layers.map((L) => L.id)]);
const shared = (a, b) => allIds(a).filter((id) => allIds(b).includes(id));

// Fake timers hold back the debounced saves and toasts, so none of them fire into a later test.
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('first visit', () => {
  it('creates one starter set with every starter sound and the starter key', async () => {
    const store = await freshStore();
    const sets = store.listSets();
    expect(sets.map((s) => s.name)).toEqual(['Starter set']);
    expect(sets[0].sounds.map((s) => s.name)).toEqual(STARTER_NAMES);
    expect(store.readSet(sets[0].id).key).toEqual(STARTER_KEY);
    expect(JSON.parse(localStorage.getItem(META_KEY))).toEqual({ seeded: true });
    expect(state(store).page).toBe('home');
  });

  it('keeps the sounds from before sets existed as a set named My sounds', async () => {
    const legacy = { sounds: [{ ...blankPatch('Old beep'), id: 'old-1' }], current: 'old-1' };
    const store = await freshStore({ saved: { [LEGACY_KEY]: legacy } });
    const sets = store.listSets();
    expect(sets.map((s) => s.name)).toEqual(['My sounds', 'Starter set']);
    expect(sets[0].sounds).toEqual([{ id: 'old-1', name: 'Old beep' }]);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('does not seed again on a later visit', async () => {
    const first = await freshStore();
    first.deleteSet(first.listSets()[0].id);
    const later = await reloadStore();
    expect(later.listSets()).toEqual([]);
  });

  it('leaves sets saved by earlier versions as they were, and never rewrites them just by loading', async () => {
    // A set as the previous release saved it: one sound per role, a key, loudness, no variants or credits.
    const mine = [{ ...blankPatch('Thock Light'), id: 'a' }, { ...blankPatch('Pop'), id: 'b' }, { ...blankPatch('Alert'), id: 'c' }];
    const saved = { name: 'My sounds', created: 1, updated: 2, sounds: mine, current: 'b', roles: { tap: 'a', send: null }, key: STARTER_KEY, loudness: { frequent: -26, confirm: -20, alert: -18 } };
    const store = await freshStore({ url: '/?set=mine', saved: { [META_KEY]: { seeded: true }, [setKey('mine')]: saved } });
    const before = localStorage.getItem(setKey('mine'));
    const { ws } = state(store);
    expect(ws.sounds).toEqual(mine);
    expect(ws.current).toBe('b');
    expect(ws.roles).toEqual({ tap: ['a'], send: null });
    expect(ws.loudness).toEqual(saved.loudness);
    expect(ws.credits).toEqual([]);
    vi.runOnlyPendingTimers();
    expect(localStorage.getItem(setKey('mine'))).toBe(before);
    expect(store.listSets().map((x) => x.name)).toEqual(['My sounds']);
  });

  it('opens the set named in the URL', async () => {
    const store = await freshStore({ url: '/?set=shop', saved: { [setKey('shop')]: { name: 'Shop', sounds: [blankPatch('Buy')] } } });
    expect(state(store).page).toBe('set');
    expect(state(store).ws.name).toBe('Shop');
  });
});

describe('sets', () => {
  it('createSet with a blank start saves one sound, opens the set and puts it in the URL', async () => {
    const store = await freshStore();
    store.createSet('Checkout', 'blank');
    const { page, ws } = state(store);
    expect(page).toBe('set');
    expect(ws.name).toBe('Checkout');
    expect(ws.sounds.map((p) => p.name)).toEqual(['Untitled sound']);
    expect(ws.key).toBeNull();
    expect(window.location.search).toBe(`?set=${ws.id}`);
    expect(JSON.parse(localStorage.getItem(setKey(ws.id))).sounds).toHaveLength(1);
  });

  it('createSet from the starter sounds keeps the starter key', async () => {
    const store = await freshStore();
    store.createSet('Product', 'starter');
    const { ws } = state(store);
    expect(ws.sounds.map((p) => p.name)).toEqual(STARTER_NAMES);
    expect(store.readSet(ws.id).key).toEqual(STARTER_KEY);
  });

  it('createSet can start with the basics, the eight sounds the first starter set had', async () => {
    const store = await freshStore();
    store.createSet('Small', 'basics');
    expect(state(store).ws.sounds.map((p) => p.name)).toEqual(BASIC_NAMES);
    expect(state(store).ws.key).toEqual(STARTER_KEY);
  });

  it('createSet picks a free name', async () => {
    const store = await freshStore();
    store.createSet('Starter set', 'blank');
    expect(state(store).ws.name).toBe('Starter set 2');
  });

  it('importSet opens a new set with fresh ids', async () => {
    const store = await freshStore();
    const patches = starterSounds().slice(0, 2);
    store.importSet('Imported', patches);
    const { page, ws, toast } = state(store);
    expect(page).toBe('set');
    expect(ws.name).toBe('Imported');
    expect(ws.sounds.map((p) => p.name)).toEqual(patches.map((p) => p.name));
    expect(shared(ws, { sounds: patches })).toEqual([]);
    expect(window.location.search).toBe(`?set=${ws.id}`);
    expect(toast.text).toBe('Imported 2 sounds as Imported.');
  });

  it('renameSet renames a saved set and ignores a blank name', async () => {
    const store = await freshStore();
    const [starter] = store.listSets();
    store.renameSet(starter.id, '  Shop\n');
    expect(store.readSet(starter.id).name).toBe('Shop');
    store.renameSet(starter.id, ' \t ');
    expect(store.readSet(starter.id).name).toBe('Shop');
  });

  it('duplicateSet copies the sounds with fresh sound and layer ids', async () => {
    const store = await freshStore();
    const [starter] = store.listSets();
    store.duplicateSet(starter.id);
    const original = store.readSet(starter.id);
    const copy = store.readSet(store.listSets().find((s) => s.name === 'Starter set copy').id);
    expect(copy.sounds.map((p) => p.name)).toEqual(STARTER_NAMES);
    expect(shared(copy, original)).toEqual([]);
    expect(copy.key).toEqual(original.key);
  });

  it('duplicateSet points role picks at the copied sounds', async () => {
    const store = await openStarter();
    const { ws } = state(store);
    const send = ws.sounds.find((p) => p.name === 'Send');
    store.setRole('tap', [send.id]);
    store.setRole('hover', null);
    store.goHome();
    store.duplicateSet(ws.id);
    const copy = store.readSet(store.listSets().find((s) => s.name === 'Starter set copy').id);
    const copiedSend = copy.sounds.find((p) => p.name === 'Send');
    expect(copiedSend.id).not.toBe(send.id);
    expect(copy.roles).toEqual({ tap: [copiedSend.id], hover: null });
  });

  it('deleteSet removes the saved set', async () => {
    const store = await freshStore();
    const [starter] = store.listSets();
    store.deleteSet(starter.id);
    expect(localStorage.getItem(setKey(starter.id))).toBeNull();
    expect(store.listSets()).toEqual([]);
  });

  it('listSets puts the most recently edited set first', async () => {
    vi.setSystemTime(1000);
    const store = await freshStore();
    const [starter] = store.listSets();
    vi.setSystemTime(2000);
    store.createSet('Second', 'blank');
    expect(store.listSets().map((s) => s.name)).toEqual(['Second', 'Starter set']);
    vi.setSystemTime(3000);
    store.renameSet(starter.id, 'Renamed');
    expect(store.listSets().map((s) => s.name)).toEqual(['Renamed', 'Second']);
  });

  it('sampleIdsInSets collects the audio every saved set uses', async () => {
    const store = await freshStore();
    const recording = (sampleId) => ({ ...blankPatch('Rec'), layers: [{ ...layerDefaults('sample'), sampleId }] });
    localStorage.setItem(setKey('one'), JSON.stringify({ name: 'One', sounds: [recording('s-a'), recording('s-b')] }));
    localStorage.setItem(setKey('two'), JSON.stringify({ name: 'Two', sounds: [recording('s-b'), blankPatch('Beep'), recording('s-c')] }));
    expect(store.sampleIdsInSets()).toEqual(new Set(['s-a', 's-b', 's-c']));
  });
});

describe('when storage is full', () => {
  it('keeps sets in memory and still lists them', async () => {
    localStorage.clear();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });
    const store = await reloadStore();
    expect(store.listSets().map((s) => s.name)).toEqual(['Starter set']);
    store.createSet('Offline', 'blank');
    expect(state(store).ws.name).toBe('Offline');
    expect(store.listSets().map((s) => s.name)).toEqual(['Offline', 'Starter set']);
    expect(localStorage).toHaveLength(0);
  });
});

describe('openSet', () => {
  it('goes home with a toast when the set is not saved here', async () => {
    const store = await freshStore({ url: '/?set=gone' });
    store.openSet('gone');
    expect(state(store).page).toBe('home');
    expect(state(store).toast.text).toBe("That set isn't saved in this browser.");
    expect(window.location.search).toBe('');
  });
});

describe('history', () => {
  it('undoes and redoes edits, with a whole drag as one step', async () => {
    const store = await openStarter();
    const { id } = store.currentSound().layers[0];
    const level = () => store.currentSound().layers[0].level;
    const before = level();
    for (const v of [-4, -5, -6]) store.editLayer(id, (L) => void (L.level = v), false);
    store.commit();
    expect(level()).toBe(-6);
    store.undo();
    expect(level()).toBe(before);
    expect(state(store)).toMatchObject({ canUndo: false, canRedo: true });
    store.redo();
    expect(level()).toBe(-6);
  });

  it('saves edits shortly after they happen', async () => {
    const store = await openStarter();
    store.edit((ws) => void (ws.name = 'Edited'));
    vi.runOnlyPendingTimers();
    expect(store.readSet(state(store).ws.id).name).toBe('Edited');
  });

  it('starts another set with a history of its own', async () => {
    const store = await openStarter();
    store.edit((ws) => void (ws.name = 'Edited'));
    store.createSet('Other', 'blank');
    expect(state(store)).toMatchObject({ canUndo: false, canRedo: false });
    store.undo();
    expect(state(store).ws.name).toBe('Other');
  });

  it("keeps a set's history after you leave and come back", async () => {
    const store = await freshStore();
    const [starter] = store.listSets();
    store.createSet('B', 'blank');
    const b = state(store).ws.id;
    store.openSet(starter.id);
    store.edit((ws) => void (ws.name = 'Edited'));
    store.goHome();
    store.openSet(b);
    store.openSet(starter.id);
    expect(state(store).ws.name).toBe('Edited');
    expect(state(store).canUndo).toBe(true);
    store.undo();
    expect(state(store).ws.name).toBe('Starter set');
  });

});

describe('palette', () => {
  const sound = (store, name) => state(store).ws.sounds.find((p) => p.name === name);
  const note = (hz) => Math.round(midiOf(hz));

  it('changeKey moves every sound into the new key, as one undo step', async () => {
    const store = await openStarter();
    const before = state(store).ws.sounds;
    store.changeKey(C_PENT);
    const body = sound(store, 'Tap').layers[0];
    // D6 and B-flat5 are the third and first notes of B-flat major pentatonic; in C they are E6 and C6.
    expect([note(body.pitchStart), note(body.pitchEnd)]).toEqual([88, 84]);
    expect(state(store).ws.key).toEqual(C_PENT);
    // Every sound with a note moves; Swipe and Capture are only noise.
    expect(state(store).toast.text).toMatch(new RegExp(`^Moved ${STARTER_NAMES.length - 2} sounds into C major pentatonic\\.`));
    store.undo();
    expect(state(store).ws.sounds).toEqual(before);
    expect(state(store).ws.key).toEqual(STARTER_KEY);
  });

  it('changeKey without retuning only changes what the checks compare against', async () => {
    const store = await openStarter();
    const before = state(store).ws.sounds;
    store.changeKey({ root: 0, scale: 'minor' }, { retune: false });
    expect(state(store).ws.sounds).toBe(before);
    expect(state(store).ws.key).toEqual({ root: 0, scale: 'minor' });
    store.changeKey(null);
    expect(state(store).ws.key).toBeNull();
    expect(state(store).ws.sounds).toBe(before);
    store.undo();
    store.undo();
    expect(state(store).ws.key).toEqual(STARTER_KEY);
  });

  it('setLoudness gives each sound the level of its role, and saves the levels with the set', async () => {
    const store = await openStarter();
    store.setLoudness({ frequent: -30, confirm: -22, alert: -16 });
    expect(['Tap', 'Toggle off', 'Send', 'Success', 'Error', 'Notification'].map((n) => sound(store, n).master.out)).toEqual([-30, -30, -22, -22, -16, -16]);
    vi.runOnlyPendingTimers();
    expect(store.readSet(state(store).ws.id).loudness).toEqual({ frequent: -30, confirm: -22, alert: -16 });
    store.undo();
    expect(sound(store, 'Tap').master.out).toBe(LOUDNESS.frequent);
    expect(state(store).ws.loudness).toEqual(LOUDNESS);
  });

  it('setLoudness leaves a sound that plays for no interaction alone', async () => {
    const store = await openStarter();
    store.setRole('tap', null);
    store.setLoudness({ ...LOUDNESS, frequent: -30 });
    expect(sound(store, 'Tap').master.out).toBe(LOUDNESS.frequent);
    expect(sound(store, 'Toggle on').master.out).toBe(-30);
  });

  it('shareRoom puts every sound in the same room, and each keeps its amount', async () => {
    const store = await openStarter();
    store.edit((ws) => void Object.assign(ws.sounds[0].master, { reverbType: 'hall', reverbSize: 1.2, reverbReverse: true }));
    const tap = sound(store, 'Tap');
    const amounts = state(store).ws.sounds.map((p) => p.master.reverbMix);
    store.shareRoom(tap.id);
    for (const p of state(store).ws.sounds) expect(p.master).toMatchObject({ reverbType: 'hall', reverbSize: 1.2, reverbDamping: tap.master.reverbDamping, reverbReverse: true });
    expect(state(store).ws.sounds.map((p) => p.master.reverbMix)).toEqual(amounts);
    store.undo();
    expect(sound(store, 'Send').master.reverbType).toBe('room');
  });

  it('keeps the loudness levels when a set is duplicated', async () => {
    const store = await openStarter();
    store.setLoudness({ frequent: -30, confirm: -22, alert: -16 });
    vi.runOnlyPendingTimers();
    store.duplicateSet(state(store).ws.id);
    const copy = store.listSets().find((x) => x.name === 'Starter set copy');
    expect(store.readSet(copy.id).loudness).toEqual({ frequent: -30, confirm: -22, alert: -16 });
  });
});

describe('createSetFromSound', () => {
  it('opens a new set of eight interactions made from the sound, in its key', async () => {
    const store = await openStarter();
    const starter = state(store).ws;
    const tap = starter.sounds.find((p) => p.name === 'Tap');
    store.createSetFromSound(tap.id);
    const { ws } = state(store);
    expect(ws.id).not.toBe(starter.id);
    expect(ws.name).toBe('Tap family');
    expect(ws.sounds.map((p) => p.name)).toEqual(BASIC_NAMES);
    expect(ws.key).toEqual(STARTER_KEY);
    expect(ws.sounds.find((p) => p.name === 'Error').tension).toBe(true);
    expect(window.location.search).toBe(`?set=${ws.id}`);
    expect(state(store).toast.text).toBe('Made Tap family from Tap, in Bb major pentatonic.');
    expect(store.readSet(starter.id).sounds).toHaveLength(STARTER_NAMES.length);
    expect(shared(ws, starter)).toEqual([]);
  });

  it('picks a free name and says when a sound has nothing to build from', async () => {
    const store = await openStarter();
    const { ws } = state(store);
    const tap = ws.sounds.find((p) => p.name === 'Tap');
    store.createSetFromSound(tap.id);
    store.openSet(ws.id);
    store.createSetFromSound(tap.id);
    expect(state(store).ws.name).toBe('Tap family 2');
    store.openSet(ws.id);
    store.edit((d) => d.sounds[0].layers.forEach((L) => void (L.on = false)));
    store.createSetFromSound(tap.id);
    expect(state(store).ws.id).toBe(ws.id);
    expect(state(store).toast.text).toBe('Tap has no layer you can hear, so there is nothing to build from.');
  });
});

describe('setRole', () => {
  it('saves a picked sound and a silent role with the set', async () => {
    const store = await openStarter();
    const { ws } = state(store);
    const send = ws.sounds.find((p) => p.name === 'Send');
    const tap = ws.sounds.find((p) => p.name === 'Tap');
    store.setRole('tap', [send.id, tap.id]);
    store.setRole('hover', null);
    vi.runOnlyPendingTimers();
    expect(store.readSet(ws.id).roles).toEqual({ tap: [send.id, tap.id], hover: null });
  });

  it('drops a role set to undefined or to no sounds, so it matches by name again', async () => {
    const store = await openStarter();
    store.setRole('tap', null);
    store.setRole('tap', undefined);
    store.setRole('send', []);
    vi.runOnlyPendingTimers();
    expect(state(store).ws.roles).toEqual({});
    expect(store.readSet(state(store).ws.id).roles).toEqual({});
  });
});

describe('addVariant', () => {
  it('adds another take after the takes the sound has, which its interaction then plays in turn', async () => {
    const store = await openStarter();
    const before = state(store).ws;
    const tap = before.sounds.find((p) => p.name === 'Tap');
    store.addVariant(tap.id);
    const { ws } = state(store);
    const names = ws.sounds.map((p) => p.name);
    expect(names.slice(0, 4)).toEqual(['Tap', 'Tap 2', 'Tap 3', 'Tap 4']);
    expect(ws.current).toBe(ws.sounds[3].id);
    expect(state(store).toast.text).toBe('Made Tap 4, another take on Tap. Tap now picks one of them at random.');
    store.undo();
    expect(state(store).ws.sounds).toEqual(before.sounds);
  });

  it('joins the interactions that were picked to play the sound', async () => {
    const store = await openStarter();
    const send = state(store).ws.sounds.find((p) => p.name === 'Send');
    store.setRole('tap', [send.id]);
    store.addVariant(send.id);
    const { ws } = state(store);
    const send2 = ws.sounds.find((p) => p.name === 'Send 2');
    expect(ws.roles.tap).toEqual([send.id, send2.id]);
    expect(state(store).toast.text).toMatch(/Tap, Send now picks one of them at random\.$/);
  });

  it('says how to use a take of a sound no interaction plays', async () => {
    const store = await freshStore({ url: '/?set=x', saved: { [setKey('x')]: { name: 'X', sounds: [{ ...blankPatch('Wobble'), id: 'w' }] } } });
    store.addVariant('w');
    expect(state(store).ws.sounds.map((p) => p.name)).toEqual(['Wobble', 'Wobble 2']);
    expect(state(store).toast.text).toMatch(/Pick both for an interaction in the preview/);
  });
});

describe('importKit', () => {
  const kit = { id: 'demo', name: 'Demo kit', credit: 'Demo kit by Someone, CC BY 4.0.' };

  it('opens the kit as a new set with its interactions and its credit, which duplicates keep', async () => {
    const store = await freshStore();
    const sounds = [{ ...blankPatch('Click 1'), id: 'k1' }, { ...blankPatch('Click 2'), id: 'k2' }];
    store.importKit(kit, sounds, { tap: ['k1', 'k2'], error: ['gone'] });
    const { ws } = state(store);
    expect(ws.name).toBe('Demo kit');
    expect(ws.roles).toEqual({ tap: ['k1', 'k2'] });
    expect(ws.credits).toEqual([kit.credit]);
    expect(ws.key).toBeNull();
    expect(state(store).toast.text).toBe('Opened Demo kit as a set of 2 sounds. Change them as you like; the kit stays as it was.');
    store.duplicateSet(ws.id);
    const copy = store.listSets().find((x) => x.name === 'Demo kit copy');
    expect(store.readSet(copy.id).credits).toEqual([kit.credit]);
    store.openSet(ws.id);
    store.createSetFromSound('k1');
    expect(state(store).ws.credits).toEqual([kit.credit]);
  });

  it('says how many sounds could not be loaded', async () => {
    const store = await freshStore();
    store.importKit(kit, [blankPatch('Click 1')], {}, 3);
    expect(state(store).toast.text).toBe("Opened Demo kit as a set of 1 sound. 3 sounds couldn't be loaded.");
  });
});
