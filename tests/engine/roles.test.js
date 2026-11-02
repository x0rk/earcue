import { describe, expect, it } from 'vitest';
import { blankPatch } from '../../src/engine/model.js';
import { normalizeRoles, ROLES, rolesInTier, soundForRole } from '../../src/engine/roles.js';

const named = (name, id) => ({ ...blankPatch(name), id });

describe('soundForRole', () => {
  const tap = named('Tap', 'tap-id');
  const ping = named('Ping', 'ping-id');
  const toggle = named('Toggle on', 'toggle-id');
  const setWith = (roles) => ({ sounds: [tap, ping, toggle], roles });

  it('uses the sound picked for the role', () => {
    expect(soundForRole(setWith({ tap: 'ping-id' }), 'tap')).toBe(ping);
  });

  it('stays silent when silence was picked', () => {
    expect(soundForRole(setWith({ tap: null }), 'tap')).toBeNull();
  });

  it('matches by slugged name when nothing was picked', () => {
    expect(soundForRole(setWith({}), 'tap')).toBe(tap);
    expect(soundForRole(setWith({}), 'toggle-on')).toBe(toggle);
    expect(soundForRole({ sounds: [named('CLICK!', 'c')] }, 'tap').id).toBe('c');
    expect(soundForRole(setWith({}), 'error')).toBeNull();
  });

  it('falls back to the name when the picked sound was deleted', () => {
    expect(soundForRole(setWith({ tap: 'deleted-id' }), 'tap')).toBe(tap);
  });

  it('finds nothing for a role that does not exist', () => {
    expect(soundForRole(setWith({}), 'wobble')).toBeNull();
  });
});

describe('normalizeRoles', () => {
  const sounds = [named('Tap', 'a'), named('Send', 'b')];

  it('keeps known roles that point at a sound in the set, or at silence', () => {
    expect(normalizeRoles({ tap: 'a', send: null, error: 'b' }, sounds)).toEqual({ tap: 'a', send: null, error: 'b' });
  });

  it('drops unknown roles, ids that are not in the set and other values', () => {
    expect(normalizeRoles({ wobble: 'a', tap: 'gone', send: 7, error: { id: 'a' }, notification: undefined }, sounds)).toEqual({});
  });

  it('returns no roles for anything that is not an object', () => {
    for (const raw of [null, undefined, 'tap', 42]) expect(normalizeRoles(raw, sounds)).toEqual({});
  });
});

describe('tiers', () => {
  it('puts every interaction in one tier, by how often it plays and how much it should be noticed', () => {
    for (const r of ROLES) expect(['frequent', 'confirm', 'alert']).toContain(r.tier);
    expect(rolesInTier('frequent')).toEqual(['tap', 'hover', 'toggle-on', 'toggle-off', 'select']);
    expect(rolesInTier('alert')).toEqual(['error', 'notification']);
  });
});
