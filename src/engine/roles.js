import { slug } from './export.js';

// The interactions a sound set covers, in the order the preview lists them: the ones most product
// sound kits name (Material, Android, Apple, Windows, Kenney and others). Until someone picks sounds
// for one, it uses the sound whose name matches, so a set made from the starter sounds is mapped from
// the start. Each belongs to a tier, by how often it plays and how much it should be noticed: frequent
// sounds stay short and quiet, alerts can be longest and loudest. A role with maxMs may run longer than
// its tier allows, and a loop role repeats until the app stops it, so its length is one cycle.
export const ROLES = [
  { id: 'tap', group: 'input', label: 'Tap', hint: 'Pressing a button.', names: ['tap', 'click', 'press'], tier: 'frequent' },
  { id: 'hover', group: 'input', label: 'Hover', hint: 'Pointing at a button. Most products keep this silent.', names: ['hover'], tier: 'frequent' },
  { id: 'focus', group: 'input', label: 'Focus', hint: 'Moving between controls with a keyboard, remote or screen reader.', names: ['focus'], tier: 'frequent' },
  { id: 'typing', group: 'input', label: 'Typing', hint: 'A key pressed while typing. Give it variants, so a sentence never sounds like a drum machine.', names: ['typing', 'type', 'keypress', 'keystroke', 'key'], tier: 'frequent' },
  { id: 'select', group: 'input', label: 'Select', hint: 'Picking a tab, a checkbox or a menu item.', names: ['select', 'check'], tier: 'frequent' },
  { id: 'toggle-on', group: 'input', label: 'Switch on', hint: 'Turning a switch or a setting on.', names: ['toggle-on', 'switch-on'], tier: 'frequent' },
  { id: 'toggle-off', group: 'input', label: 'Switch off', hint: 'Turning it off again.', names: ['toggle-off', 'switch-off'], tier: 'frequent' },
  { id: 'open', group: 'navigation', label: 'Open', hint: 'A dialog or a menu appearing.', names: ['open', 'expand'], tier: 'confirm' },
  { id: 'close', group: 'navigation', label: 'Close', hint: 'A dialog or a menu going away.', names: ['close', 'collapse', 'dismiss'], tier: 'confirm' },
  { id: 'back', group: 'navigation', label: 'Back', hint: 'Leaving a page for the one before. Not the same as closing a layer.', names: ['back', 'go-back', 'previous'], tier: 'confirm' },
  { id: 'swipe', group: 'navigation', label: 'Swipe', hint: 'Paging sideways, as in a carousel or between screens.', names: ['swipe', 'page', 'page-turn'], tier: 'confirm' },
  { id: 'send', group: 'messages', label: 'Send', hint: 'Sending a message or submitting a form.', names: ['send', 'submit'], tier: 'confirm' },
  { id: 'receive', group: 'messages', label: 'Receive', hint: 'A message arriving.', names: ['receive', 'incoming'], tier: 'confirm' },
  { id: 'success', group: 'status', label: 'Success', hint: 'Something finished well.', names: ['success', 'done', 'complete'], tier: 'confirm' },
  { id: 'complete', group: 'status', label: 'Complete', hint: 'A long task done, often while you were elsewhere. Bigger than success.', names: ['complete', 'completed', 'finished'], tier: 'alert' },
  { id: 'celebrate', group: 'status', label: 'Celebrate', hint: 'A rare big moment, like a first order or a streak. Can run longer.', names: ['celebrate', 'celebration', 'achievement', 'reward'], tier: 'alert', maxMs: 1200 },
  { id: 'cancel', group: 'status', label: 'Cancel', hint: 'Backing out of an action. Not an error, so keep it neutral.', names: ['cancel', 'abort'], tier: 'confirm' },
  { id: 'delete', group: 'status', label: 'Delete', hint: 'Removing an item.', names: ['delete', 'remove', 'trash'], tier: 'confirm' },
  { id: 'warning', group: 'status', label: 'Warning', hint: 'Something may go wrong. Between a notification and an error.', names: ['warning', 'warn', 'caution'], tier: 'alert' },
  { id: 'error', group: 'status', label: 'Error', hint: 'Something went wrong.', names: ['error', 'fail', 'failure'], tier: 'alert' },
  { id: 'notification', group: 'alerts', label: 'Notification', hint: 'Something needs attention.', names: ['notification', 'notify', 'alert'], tier: 'alert' },
  { id: 'urgent', group: 'alerts', label: 'Urgent alert', hint: 'Something needs attention now. Louder and more insistent than a notification.', names: ['urgent', 'urgent-alert', 'critical', 'alert'], tier: 'alert' },
  { id: 'ring', group: 'alerts', label: 'Ring', hint: 'An incoming call. Loops until it is answered or declined.', names: ['ring', 'ringtone', 'incoming-call', 'call'], tier: 'alert', loop: true, maxMs: 2000 },
  { id: 'alarm', group: 'alerts', label: 'Alarm', hint: 'A timer or a reminder going off. Loops until it is stopped.', names: ['alarm', 'timer'], tier: 'alert', loop: true, maxMs: 2000 },
  { id: 'lock', group: 'device', label: 'Lock', hint: 'Locking the screen, a file or a setting.', names: ['lock'], tier: 'confirm' },
  { id: 'unlock', group: 'device', label: 'Unlock', hint: 'Unlocking it again.', names: ['unlock'], tier: 'confirm' },
  { id: 'connect', group: 'device', label: 'Connect', hint: 'A device, a call or a live session connecting.', names: ['connect', 'connected', 'plug-in'], tier: 'confirm' },
  { id: 'disconnect', group: 'device', label: 'Disconnect', hint: 'It disconnecting.', names: ['disconnect', 'disconnected', 'unplug'], tier: 'confirm' },
  { id: 'capture', group: 'device', label: 'Capture', hint: 'Taking a photo or a screenshot.', names: ['capture', 'camera', 'shutter', 'screenshot'], tier: 'confirm' },
];

export const ROLE_GROUPS = [
  { id: 'input', label: 'Buttons and input' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'messages', label: 'Messages' },
  { id: 'status', label: 'Status' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'device', label: 'Device' },
];

// Kits ship several takes of one interaction (Material has four taps), and the app plays one of them
// at random, so a sound heard all day never repeats exactly. More than this stops being useful.
export const MAX_VARIANTS = 8;

const ROLE_BY_ID = new Map(ROLES.map((r) => [r.id, r]));
export const ROLE_IDS = ROLES.map((r) => r.id);
export const roleOf = (id) => ROLE_BY_ID.get(id) || null;
export const roleLabel = (id) => ROLE_BY_ID.get(id)?.label || id;
export const rolesInTier = (tier) => ROLES.filter((r) => r.tier === tier).map((r) => r.id);

// The short scene the study suggests for hearing a set together.
export const SCENE = ['tap', 'send', 'receive', 'success'];

// "Tap 2" and "Tap 3" are variants of "Tap": the name without a trailing number.
const VARIANT_SUFFIX = /-\d+$/;

// The sounds an interaction plays, one picked at random each time. A role maps to a list of sound ids
// (older sets saved a single id), or to null when someone chose silence. A role without an entry, or
// whose sounds were all deleted, falls back to names: the first of the role's names that a sound has,
// together with the numbered variants of that name.
export function soundsForRole(set, roleId) {
  const picked = set.roles?.[roleId];
  if (picked === null) return [];
  const ids = typeof picked === 'string' ? [picked] : Array.isArray(picked) ? picked : [];
  const chosen = ids.map((id) => set.sounds.find((s) => s.id === id)).filter(Boolean);
  if (chosen.length) return chosen;
  const role = ROLE_BY_ID.get(roleId);
  if (!role) return [];
  const slugs = set.sounds.map((s) => slug(s.name));
  for (const name of role.names) {
    if (!slugs.includes(name) && !slugs.some((x) => x.replace(VARIANT_SUFFIX, '') === name)) continue;
    return set.sounds.filter((s, i) => slugs[i] === name || slugs[i].replace(VARIANT_SUFFIX, '') === name).slice(0, MAX_VARIANTS);
  }
  return [];
}

export const soundForRole = (set, roleId) => soundsForRole(set, roleId)[0] || null;

export function normalizeRoles(raw, sounds) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  const has = (id) => typeof id === 'string' && sounds.some((s) => s.id === id);
  for (const id of ROLE_IDS) {
    const v = raw[id];
    if (v === null) out[id] = null;
    else if (has(v)) out[id] = [v];
    else if (Array.isArray(v)) {
      const ids = [...new Set(v.filter(has))].slice(0, MAX_VARIANTS);
      if (ids.length) out[id] = ids;
    }
  }
  return out;
}
