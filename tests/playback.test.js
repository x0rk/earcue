// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

// A stand-in for the browser's AudioContext that records what was started and stopped.
class FakeContext {
  constructor() {
    this.currentTime = 1;
    this.state = 'running';
    this.destination = {};
    this.sources = [];
  }
  createBuffer() {
    return { copyToChannel() {} };
  }
  createBufferSource() {
    const src = { playbackRate: { value: 1 }, connect: (n) => n, start: vi.fn(), stop: vi.fn(), onended: null };
    this.sources.push(src);
    return src;
  }
  createGain() {
    return { gain: { setTargetAtTime: vi.fn() }, connect: (n) => n };
  }
  resume() {
    return Promise.resolve();
  }
}

const res = { duration: 0.2, sr: 48000, channels: [new Float32Array(10), new Float32Array(10)] };

async function load() {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.resetModules();
  window.AudioContext = FakeContext;
  const store = await import('../src/store.js');
  const playback = await import('../src/playback.js');
  store.openSet(store.listSets()[0].id);
  return { store, playback, ctx: playback.audioCtx() };
}

beforeEach(() => vi.useFakeTimers());

describe('playback', () => {
  it('stops the sound being edited, and its playhead, when you pick another sound', async () => {
    const { store, playback, ctx } = await load();
    const { ws } = store.useStore.getState();
    playback.results.set(ws.current, res);
    const heard = [];
    playback.onPlay((e) => heard.push(e && 'start'));
    playback.playCurrent();
    expect(ctx.sources).toHaveLength(1);
    store.selectSound(ws.sounds[1].id);
    expect(ctx.sources[0].stop).toHaveBeenCalledTimes(1);
    expect(heard).toEqual(['start', null]);
  });

  it('turns the loop off, so the next sound does not start by itself', async () => {
    const { store, playback, ctx } = await load();
    const { ws } = store.useStore.getState();
    for (const s of ws.sounds) playback.results.set(s.id, res);
    playback.setLoop(true);
    store.selectSound(ws.sounds[2].id);
    expect(store.useStore.getState().loop).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(ctx.sources).toHaveLength(1);
  });

  it('stops when the set closes, and leaves editing the same sound alone', async () => {
    const { store, playback, ctx } = await load();
    playback.results.set(store.useStore.getState().ws.current, res);
    playback.playCurrent();
    store.editMaster((m) => void (m.out = -12));
    expect(ctx.sources[0].stop).not.toHaveBeenCalled();
    store.goHome();
    expect(ctx.sources[0].stop).toHaveBeenCalledTimes(1);
  });

  it('lets the interaction sounds of the preview ring on', async () => {
    const { store, playback, ctx } = await load();
    const { ws } = store.useStore.getState();
    playback.playResult(res, { editor: false });
    store.selectSound(ws.sounds[1].id);
    expect(ctx.sources[0].stop).not.toHaveBeenCalled();
  });
});
