import { slug } from './export.js';

// The interactions a sound set covers, in the order the preview lists them. Until someone picks a
// sound for one, it uses the sound whose name matches, so a set made from the starter sounds is
// mapped from the start. Each belongs to a tier, by how often it plays and how much it should be
// noticed: frequent sounds stay short and quiet, alerts can be longest and loudest.
export const ROLES = [
  { id: 'tap', label: 'Tap', hint: 'Pressing a button.', names: ['tap', 'click', 'press'], tier: 'frequent' },
  { id: 'hover', label: 'Hover', hint: 'Pointing at a button. Most products keep this silent.', names: ['hover'], tier: 'frequent' },
  { id: 'toggle-on', label: 'Switch on', hint: 'Turning a switch or a setting on.', names: ['toggle-on', 'switch-on'], tier: 'frequent' },
  { id: 'toggle-off', label: 'Switch off', hint: 'Turning it off again.', names: ['toggle-off', 'switch-off'], tier: 'frequent' },
  { id: 'select', label: 'Select', hint: 'Picking a tab, a checkbox or a menu item.', names: ['select', 'check'], tier: 'frequent' },
  { id: 'open', label: 'Open', hint: 'A dialog or a menu appearing.', names: ['open', 'expand'], tier: 'confirm' },
  { id: 'close', label: 'Close', hint: 'A dialog or a menu going away.', names: ['close', 'collapse', 'dismiss'], tier: 'confirm' },
  { id: 'send', label: 'Send', hint: 'Sending a message or submitting a form.', names: ['send', 'submit'], tier: 'confirm' },
  { id: 'receive', label: 'Receive', hint: 'A message arriving.', names: ['receive', 'incoming'], tier: 'confirm' },
  { id: 'success', label: 'Success', hint: 'Something finished well.', names: ['success', 'done', 'complete'], tier: 'confirm' },
  { id: 'error', label: 'Error', hint: 'Something went wrong.', names: ['error', 'fail', 'failure'], tier: 'alert' },
  { id: 'notification', label: 'Notification', hint: 'Something needs attention.', names: ['notification', 'notify', 'alert'], tier: 'alert' },
  { id: 'delete', label: 'Delete', hint: 'Removing an item.', names: ['delete', 'remove', 'trash'], tier: 'confirm' },
];

export const ROLE_IDS = ROLES.map((r) => r.id);
export const roleLabel = (id) => ROLES.find((r) => r.id === id)?.label || id;
export const rolesInTier = (tier) => ROLES.filter((r) => r.tier === tier).map((r) => r.id);

// The short scene the study suggests for hearing a set together.
export const SCENE = ['tap', 'send', 'receive', 'success'];

// A role maps to a sound id, or to null when someone chose silence. A role without an entry, or one
// whose sound was deleted, falls back to matching names.
export function soundForRole(set, roleId) {
  const picked = set.roles?.[roleId];
  if (picked === null) return null;
  const chosen = picked && set.sounds.find((s) => s.id === picked);
  if (chosen) return chosen;
  const role = ROLES.find((r) => r.id === roleId);
  return (role && set.sounds.find((s) => role.names.includes(slug(s.name)))) || null;
}

export function normalizeRoles(raw, sounds) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const id of ROLE_IDS) {
    const v = raw[id];
    if (v === null || (typeof v === 'string' && sounds.some((s) => s.id === v))) out[id] = v;
  }
  return out;
}
