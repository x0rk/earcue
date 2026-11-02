import { describe, expect, it } from 'vitest';
import { blankPatch } from '../../src/engine/model.js';
import { MAX_VARIANTS, normalizeRoles, ROLE_GROUPS, ROLES, rolesInTier, soundForRole, soundsForRole } from '../../src/engine/roles.js';

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

  it('keeps known roles that point at sounds in the set, or at silence, as lists of sound ids', () => {
    expect(normalizeRoles({ tap: ['a', 'b'], send: null, error: ['b'] }, sounds)).toEqual({ tap: ['a', 'b'], send: null, error: ['b'] });
  });

  it('reads the single id that sets saved before variants existed', () => {
    expect(normalizeRoles({ tap: 'a', send: null, error: 'b' }, sounds)).toEqual({ tap: ['a'], send: null, error: ['b'] });
  });

  it('drops ids that are not in the set, repeats, and lists that end up empty', () => {
    expect(normalizeRoles({ tap: ['gone', 'a', 'a', 7], send: ['gone'] }, sounds)).toEqual({ tap: ['a'] });
    const many = Array.from({ length: 12 }, (_, i) => named(`Tap ${i + 1}`, `t${i}`));
    expect(normalizeRoles({ tap: many.map((s) => s.id) }, many).tap).toHaveLength(MAX_VARIANTS);
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
    expect(rolesInTier('frequent')).toEqual(['tap', 'hover', 'focus', 'typing', 'select', 'toggle-on', 'toggle-off']);
    expect(rolesInTier('alert')).toEqual(['complete', 'celebrate', 'warning', 'error', 'notification', 'urgent', 'ring', 'alarm']);
  });

  it('lets only rare and looping interactions run past their tier', () => {
    expect(ROLES.filter((r) => r.maxMs).map((r) => r.id)).toEqual(['celebrate', 'ring', 'alarm']);
    expect(ROLES.filter((r) => r.loop).map((r) => r.id)).toEqual(['ring', 'alarm']);
  });
});

describe('the interaction list', () => {
  it('covers what most product sound kits name, each in a group of the preview', () => {
    expect(ROLES).toHaveLength(29);
    for (const id of ['back', 'swipe', 'lock', 'unlock', 'ring', 'alarm', 'cancel', 'complete', 'celebrate', 'warning', 'urgent', 'focus', 'typing', 'connect', 'disconnect', 'capture']) {
      expect(ROLES.map((r) => r.id)).toContain(id);
    }
    const groups = ROLE_GROUPS.map((g) => g.id);
    for (const r of ROLES) expect(groups).toContain(r.group);
  });

  it('gives each name to one interaction first, so no two take the same sound by name', () => {
    const first = ROLES.map((r) => r.names[0]);
    expect(new Set(first).size).toBe(first.length);
  });
});

describe('soundsForRole', () => {
  const sounds = ['Tap', 'Tap 2', 'Click', 'Tap 3', 'Tapper', 'Send'].map((name, i) => named(name, `s${i}`));

  it('plays the numbered takes of the matching name as variants, and only those', () => {
    expect(soundsForRole({ sounds, roles: {} }, 'tap').map((s) => s.name)).toEqual(['Tap', 'Tap 2', 'Tap 3']);
  });

  it("prefers the role's first name over its other names, whatever the order of the set", () => {
    expect(soundForRole({ sounds: [named('Click', 'c'), named('Tap', 't')], roles: {} }, 'tap').id).toBe('t');
    expect(soundForRole({ sounds: [named('Alert', 'a'), named('Notification', 'n')], roles: {} }, 'notification').id).toBe('n');
  });

  it('plays the picked sounds in the order they were picked', () => {
    expect(soundsForRole({ sounds, roles: { tap: ['s5', 's0'] } }, 'tap').map((s) => s.name)).toEqual(['Send', 'Tap']);
  });

  it('matches numbered takes even when the first take is gone', () => {
    expect(soundsForRole({ sounds: [named('Typing 2', 'x'), named('Typing 3', 'y')], roles: {} }, 'typing').map((s) => s.id)).toEqual(['x', 'y']);
  });
});
