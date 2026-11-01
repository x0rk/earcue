import { slug } from './export.js';

// The interactions a sound set covers, in the order the preview lists them. Until someone picks a
// sound for one, it uses the sound whose name matches, so a set made from the starter sounds is
// mapped from the start.
export const ROLES = [
  { id: 'tap', label: 'Tap', hint: 'Pressing a button.', names: ['tap', 'click', 'press'] },
  { id: 'hover', label: 'Hover', hint: 'Pointing at a button. Most products keep this silent.', names: ['hover'] },
  { id: 'toggle-on', label: 'Switch on', hint: 'Turning a switch or a setting on.', names: ['toggle-on', 'switch-on'] },
  { id: 'toggle-off', label: 'Switch off', hint: 'Turning it off again.', names: ['toggle-off', 'switch-off'] },
  { id: 'select', label: 'Select', hint: 'Picking a tab, a checkbox or a menu item.', names: ['select', 'check'] },
  { id: 'open', label: 'Open', hint: 'A dialog or a menu appearing.', names: ['open', 'expand'] },
  { id: 'close', label: 'Close', hint: 'A dialog or a menu going away.', names: ['close', 'collapse', 'dismiss'] },
  { id: 'send', label: 'Send', hint: 'Sending a message or submitting a form.', names: ['send', 'submit'] },
  { id: 'receive', label: 'Receive', hint: 'A message arriving.', names: ['receive', 'incoming'] },
  { id: 'success', label: 'Success', hint: 'Something finished well.', names: ['success', 'done', 'complete'] },
  { id: 'error', label: 'Error', hint: 'Something went wrong.', names: ['error', 'fail', 'failure'] },
  { id: 'notification', label: 'Notification', hint: 'Something needs attention.', names: ['notification', 'notify', 'alert'] },
  { id: 'delete', label: 'Delete', hint: 'Removing an item.', names: ['delete', 'remove', 'trash'] },
];

export const ROLE_IDS = ROLES.map((r) => r.id);
export const roleLabel = (id) => ROLES.find((r) => r.id === id)?.label || id;

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
