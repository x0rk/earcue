import { blankPatch, cleanName, layerDefaults, LOUDNESS, uniqueName } from './model.js';
import { MAX_VARIANTS, ROLES, roleOf } from './roles.js';
import { detectOnsetMs } from './samples.js';

// Bundled kits are openly licensed UI sound packs (Kenney, Material, Android, KDE Ocean, uisfx) kept as
// files under public/kits, with public/kits/index.json listing each kit, its licence and credit, and
// the interaction each of its sounds was made for. Opening one makes a set of its recordings.

const KIT_ID = /^[a-z0-9-]{1,40}$/;
// A plain file name in the kit's folder, so a manifest entry can never point anywhere else.
const KIT_FILE = /^[\w.-]{1,80}\.(ogg|oga)$/i;
const MAX_TEXT = 300;

const text = (v, max = MAX_TEXT) => (typeof v === 'string' ? cleanName(v, max) : '');

export function normalizeKits(raw) {
  if (!raw || !Array.isArray(raw.kits)) return [];
  return raw.kits
    .filter((k) => k && KIT_ID.test(k.id) && text(k.name) && Array.isArray(k.sounds))
    .map((k) => ({
      id: k.id,
      name: text(k.name, 60),
      by: text(k.by),
      about: text(k.about),
      license: text(k.license, 40),
      licenseUrl: /^https:\/\//.test(k.licenseUrl) ? k.licenseUrl : '',
      source: /^https:\/\//.test(k.source) ? k.source : '',
      credit: text(k.credit) || text(k.name, 60),
      shareAlike: k.shareAlike === true,
      // Kits from one source that differ only in style, like uisfx's packs, share a card.
      ...(text(k.pack, 40) && { pack: text(k.pack, 40) }),
      sounds: k.sounds
        .filter((s) => s && KIT_FILE.test(s.file) && text(s.name, 60))
        .map((s) => ({ file: s.file, name: text(s.name, 60), ...(roleOf(s.role) && { role: s.role }) })),
    }))
    .filter((k) => k.sounds.length);
}

// The same file always gets the same id, so opening a kit twice stores its audio once.
export const kitSampleId = (kitId, file) => `k-${kitId}-${file.replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

const ROLE_ORDER = new Map(ROLES.map((r, i) => [r.id, i]));

// The sounds of a set made from a kit: each recording as a sound of its own, trimmed to where it starts
// and as loud as the tier of the interaction it was made for. Sounds made for an interaction come
// first, in the preview's order, then the rest as the kit lists them. entries: [{ sound, sample }].
export function kitSounds(kit, entries) {
  const ordered = entries
    .map((e, i) => ({ ...e, i }))
    .sort((a, b) => (ROLE_ORDER.get(a.sound.role) ?? ROLES.length) - (ROLE_ORDER.get(b.sound.role) ?? ROLES.length) || a.i - b.i);
  const names = [];
  const roles = {};
  const sounds = ordered.map(({ sound, sample }) => {
    const role = roleOf(sound.role);
    const p = blankPatch(uniqueName(sound.name, names));
    names.push(p.name);
    p.description = kit.credit;
    p.layers = [{ ...layerDefaults('sample'), name: 'Recording', sampleId: sample.id, sampleName: sound.file, trimStart: Math.round(detectOnsetMs(sample) * 10) / 10 }];
    p.master.out = LOUDNESS[role?.tier || 'confirm'];
    if (role && (roles[role.id] ||= []).length < MAX_VARIANTS) roles[role.id].push(p.id);
    return p;
  });
  return { sounds, roles };
}
