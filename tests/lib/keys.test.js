import { afterEach, describe, expect, it, vi } from 'vitest';

// keys.js decides once, as it loads, whether it runs on a Mac, so each case stubs navigator first.
async function keyLabelOn(navigator) {
  vi.stubGlobal('navigator', navigator);
  vi.resetModules();
  return (await import('../../src/lib/keys.js')).keyLabel;
}

afterEach(() => vi.unstubAllGlobals());

describe('keyLabel', () => {
  it('keeps the symbols on a Mac', async () => {
    const keyLabel = await keyLabelOn({ platform: 'MacIntel', userAgent: '' });
    expect(keyLabel('⌘Z / ⇧⌘Z')).toBe('⌘Z / ⇧⌘Z');
    expect(keyLabel('⌘ + scroll')).toBe('⌘ + scroll');
  });

  it('treats an iPad that reports no platform as a Mac', async () => {
    const keyLabel = await keyLabelOn({ platform: '', userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)' });
    expect(keyLabel('⌘D')).toBe('⌘D');
  });

  it('spells the keys out everywhere else', async () => {
    const keyLabel = await keyLabelOn({ platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
    expect(keyLabel('⌘Z / ⇧⌘Z')).toBe('Ctrl+Z / Ctrl+Shift+Z');
    expect(keyLabel('⌘C / ⌘V')).toBe('Ctrl+C / Ctrl+V');
    expect(keyLabel('⌘ + scroll')).toBe('Ctrl + scroll');
    expect(keyLabel('⌥⌘D')).toBe('Alt+Ctrl+D');
    expect(keyLabel('⌫')).toBe('Backspace');
  });

  it('spells the keys out when there is no navigator', async () => {
    const keyLabel = await keyLabelOn(undefined);
    expect(keyLabel('⌘D')).toBe('Ctrl+D');
  });
});
