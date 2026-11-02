import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { kitSampleId, kitSounds, normalizeKits } from '../../src/engine/kits.js';
import { LOUDNESS } from '../../src/engine/model.js';
import { MAX_VARIANTS, roleOf } from '../../src/engine/roles.js';

const KITS_DIR = new URL('../../public/kits/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('index.json', KITS_DIR), 'utf8'));
const kits = normalizeKits(manifest);
const fileIn = (kit, name) => new URL(`${kit.id}/${name}`, KITS_DIR);
// The licences that let a kit ship inside an MIT app, edited and re-shared.
const OPEN_LICENSES = ['CC0 1.0', 'CC BY 4.0', 'CC BY-SA 4.0', 'Apache 2.0'];

describe('bundled kits', () => {
  it('lists every kit, and the app reads every entry', () => {
    expect(kits.map((k) => k.id)).toEqual(manifest.kits.map((k) => k.id));
    expect(kits.map((k) => k.sounds.length)).toEqual(manifest.kits.map((k) => k.sounds.length));
    expect(kits.slice(0, 5).map((k) => k.name)).toEqual(['Kenney UI Audio', 'Kenney Interface Sounds', 'Material', 'Android', 'KDE Ocean']);
    expect(kits.filter((k) => k.pack)).toHaveLength(11);
  });

  it.each(kits.map((k) => [k.id, k]))('%s has an open licence, its licence file and a credit', (_, kit) => {
    expect(OPEN_LICENSES).toContain(kit.license);
    expect(kit.licenseUrl).toMatch(/^https:\/\//);
    expect(kit.source).toMatch(/^https:\/\//);
    expect(kit.credit).toContain(kit.license);
    expect(existsSync(fileIn(kit, 'LICENSE.txt')) || existsSync(fileIn(kit, 'NOTICE.txt'))).toBe(true);
    expect(kit.shareAlike).toBe(kit.license === 'CC BY-SA 4.0');
  });

  it.each(kits.map((k) => [k.id, k]))('%s ships every file it lists, as Ogg audio', (_, kit) => {
    for (const s of kit.sounds) {
      const url = fileIn(kit, s.file);
      expect(existsSync(url), s.file).toBe(true);
      expect(readFileSync(url).subarray(0, 4).toString('latin1'), s.file).toBe('OggS');
      expect(statSync(url).size).toBeGreaterThan(0);
    }
  });

  it.each(kits.map((k) => [k.id, k]))('%s maps sounds to interactions, with no more takes than a role can hold', (_, kit) => {
    const mapped = kit.sounds.filter((s) => s.role);
    expect(mapped.length).toBeGreaterThan(0);
    const counts = {};
    for (const s of mapped) counts[s.role] = (counts[s.role] || 0) + 1;
    for (const [role, n] of Object.entries(counts)) {
      expect(roleOf(role), role).toBeTruthy();
      expect(n, role).toBeLessThanOrEqual(MAX_VARIANTS);
    }
    expect(new Set(kit.sounds.map((s) => kitSampleId(kit.id, s.file))).size).toBe(kit.sounds.length);
  });
});

describe('normalizeKits', () => {
  const sound = { file: 'click.ogg', name: 'Click', role: 'tap' };
  const kit = { id: 'demo', name: 'Demo', credit: 'Demo, CC0 1.0.', license: 'CC0 1.0', licenseUrl: 'https://example.org/l', source: 'https://example.org', sounds: [sound] };

  it('keeps only file names inside the kit folder, and known interactions', () => {
    const [k] = normalizeKits({
      kits: [{ ...kit, sounds: [sound, { file: '../secret.ogg', name: 'Up' }, { file: 'a/b.ogg', name: 'Nested' }, { file: 'x.wav', name: 'Wav' }, { file: 'odd.ogg', name: 'Odd', role: 'wobble' }] }],
    });
    expect(k.sounds).toEqual([sound, { file: 'odd.ogg', name: 'Odd' }]);
  });

  it('drops kits with bad ids or no sounds, and links that are not https', () => {
    expect(normalizeKits({ kits: [{ ...kit, id: '../x' }, { ...kit, id: 'empty', sounds: [] }] })).toEqual([]);
    const [k] = normalizeKits({ kits: [{ ...kit, licenseUrl: 'javascript:alert(1)', source: 'http://example.org' }] });
    expect([k.licenseUrl, k.source]).toEqual(['', '']);
    for (const raw of [null, {}, { kits: 'no' }]) expect(normalizeKits(raw)).toEqual([]);
  });
});

describe('kitSounds', () => {
  const kit = { id: 'demo', credit: 'Demo, CC0 1.0.' };
  // A clip that is silent for its first 10 ms, then sounds.
  const clip = (id) => ({ id, name: id, sampleRate: 48000, channels: [Float32Array.from({ length: 4800 }, (_, i) => (i < 480 ? 0 : 0.5))] });
  const entry = (file, name, role) => ({ sound: { file, name, ...(role && { role }) }, sample: clip(`s-${file}`) });

  it('makes one sound per recording, trimmed to where it starts, in the order of the preview', () => {
    const { sounds, roles } = kitSounds(kit, [entry('bell.ogg', 'Bell'), entry('err.ogg', 'Oops', 'error'), entry('c1.ogg', 'Click', 'tap'), entry('c2.ogg', 'Click', 'tap')]);
    expect(sounds.map((p) => p.name)).toEqual(['Click', 'Click 2', 'Oops', 'Bell']);
    expect(roles).toEqual({ tap: [sounds[0].id, sounds[1].id], error: [sounds[2].id] });
    const [L] = sounds[0].layers;
    expect(L).toMatchObject({ type: 'sample', sampleId: 's-c1.ogg', sampleName: 'c1.ogg' });
    expect(L.trimStart).toBeCloseTo(8, 0);
    expect(sounds[0].description).toBe(kit.credit);
  });

  it('sets each sound as loud as the tier of its interaction', () => {
    const { sounds } = kitSounds(kit, [entry('a.ogg', 'A', 'tap'), entry('b.ogg', 'B', 'send'), entry('c.ogg', 'C', 'ring'), entry('d.ogg', 'D')]);
    expect(sounds.map((p) => p.master.out)).toEqual([LOUDNESS.frequent, LOUDNESS.confirm, LOUDNESS.alert, LOUDNESS.confirm]);
  });

  it('keeps no more takes per interaction than a role can hold', () => {
    const many = Array.from({ length: 12 }, (_, i) => entry(`t${i}.ogg`, 'Tick', 'tap'));
    expect(kitSounds(kit, many).roles.tap).toHaveLength(MAX_VARIANTS);
  });
});
