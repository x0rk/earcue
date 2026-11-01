import { useEffect, useRef } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import { dbToGain } from '../engine/engine.js';
import { TYPE_LABEL } from '../engine/model.js';
import { clipMs, estimateLength } from '../engine/render.js';
import { samples, sampleDurationMs } from '../engine/samples.js';
import { comparePatch, onPlay, results } from '../playback.js';
import { commit, currentSound, editLayer, select, setPref, setView, useStore } from '../store.js';
import { IconButton, Button, Select } from './ui.jsx';

const LANE = { ruler: 26, output: 96, layer: 64 };
const HEADER_W = 120;
const PADX = 14;
const LEVEL_MAX_DB = 6;
const LEVEL_MIN_DB = -48;
const TICK_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
const MIN_TICK_PX = 58;
const TOKENS = ['lane', 'lane-alt', 'line', 'line-strong', 'ink', 'muted', 'faint', 'accent', 'accent-soft', 'hot', 'b', 'canvas', 'panel', 'c-tone', 'c-noise', 'c-modal', 'c-sample'];

const levelToY = (db, top, bot) => top + ((LEVEL_MAX_DB - db) / (LEVEL_MAX_DB - LEVEL_MIN_DB)) * (bot - top);
const yToLevel = (y, top, bot) => LEVEL_MAX_DB - ((y - top) / (bot - top)) * (LEVEL_MAX_DB - LEVEL_MIN_DB);

function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const out = {};
  for (const k of TOKENS) out[k] = cs.getPropertyValue(`--${k}`).trim();
  return out;
}

function fitView(patch) {
  let ms = estimateLength(patch) * 1000;
  const cmp = comparePatch();
  if (cmp) ms = Math.max(ms, estimateLength(cmp) * 1000);
  const res = results.get(patch.id);
  let clipEnd = 0;
  for (const L of patch.layers) clipEnd = Math.max(clipEnd, clipMs(L)[1]);
  if (res) ms = Math.max(Math.min(ms, res.duration * 1000 + 30), clipEnd + 10);
  return { start: 0, end: Math.max(40, ms * 1.06) };
}

export function effectiveView(s = useStore.getState()) {
  return s.view.auto ? fitView(currentSound(s)) : s.view;
}

function roundRect(g, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

function handlePoints(L, lane, xAt) {
  const top = lane.y + 9;
  const bot = lane.y + lane.h - 9;
  if (L.type === 'sample') {
    const [c0, c1] = clipMs(L);
    return { kind: 'sample', top, bot, left: { x: xAt(c0) }, right: { x: xAt(c1) } };
  }
  const yPeak = levelToY(L.level, top, bot);
  const holdEnd = L.start + L.attack + (L.type === 'modal' ? 0 : L.hold);
  return {
    kind: 'synth',
    top,
    bot,
    start: { x: xAt(L.start), y: bot },
    peak: { x: xAt(L.start + L.attack), y: yPeak },
    hold: { x: xAt(holdEnd), y: yPeak },
    decay: { x: xAt(holdEnd + L.decay), y: bot },
  };
}

function draw(canvas, wrap, playheadMs) {
  const s = useStore.getState();
  const patch = currentSound(s);
  const res = results.get(patch.id);
  const cmp = comparePatch(s);
  const resB = cmp ? results.get(cmp.id) : null;
  const W = wrap.clientWidth;
  if (!W) return null;
  const c = readColors();
  const lanes = [
    { kind: 'ruler', y: 0, h: LANE.ruler },
    { kind: 'output', y: LANE.ruler, h: LANE.output },
  ];
  let y = LANE.ruler + LANE.output;
  for (const L of patch.layers) {
    lanes.push({ kind: 'layer', id: L.id, y, h: LANE.layer });
    y += LANE.layer;
  }
  const H = Math.max(y + 12, wrap.clientHeight - 1);
  const dpr = window.devicePixelRatio || 1;
  canvas.style.height = `${H}px`;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const { start, end } = effectiveView(s);
  const span = end - start;
  const inner = Math.max(40, W - HEADER_W - 2 * PADX);
  const xAt = (ms) => HEADER_W + PADX + ((ms - start) / span) * inner;
  const msAt = (x) => start + ((x - HEADER_W - PADX) / inner) * span;
  const font = getComputedStyle(document.body).fontFamily;

  g.fillStyle = c.canvas;
  g.fillRect(0, 0, W, H);
  g.save();
  g.beginPath();
  g.rect(HEADER_W, 0, W - HEADER_W, H);
  g.clip();
  lanes.forEach((ln, i) => {
    if (ln.kind === 'ruler') return;
    g.fillStyle = i % 2 ? c.lane : c['lane-alt'];
    g.fillRect(0, ln.y, W, ln.h);
    if (ln.kind === 'layer' && s.sel?.id === ln.id) {
      g.fillStyle = c['accent-soft'];
      g.globalAlpha = 0.5;
      g.fillRect(0, ln.y, W, ln.h);
      g.globalAlpha = 1;
    }
    g.fillStyle = c.line;
    g.fillRect(0, ln.y + ln.h - 1, W, 1);
  });

  const pxPerMs = inner / span;
  const stepMs = TICK_STEPS.find((v) => v * pxPerMs >= MIN_TICK_PX) || 1000;
  g.font = `11px ${font}`;
  g.textBaseline = 'middle';
  for (let t = Math.ceil(start / stepMs) * stepMs; t <= end; t += stepMs) {
    const x = Math.round(xAt(t)) + 0.5;
    g.fillStyle = c.line;
    g.fillRect(x, LANE.ruler, 1, H - LANE.ruler);
    g.fillStyle = c['line-strong'];
    g.fillRect(x, LANE.ruler - 6, 1, 6);
    g.fillStyle = c.muted;
    const label = stepMs < 1 ? t.toFixed(1) : String(Math.round(t));
    g.fillText(t === 0 ? '0 ms' : label, x + 4, LANE.ruler / 2);
  }
  if (s.snap && s.snap * pxPerMs >= 6) {
    g.fillStyle = c.line;
    g.globalAlpha = 0.5;
    for (let t = Math.ceil(start / s.snap) * s.snap; t <= end; t += s.snap) g.fillRect(Math.round(xAt(t)), LANE.ruler, 1, 4);
    g.globalAlpha = 1;
  }

  const wave = (data, sr, top, hgt, scale, color, alpha) => {
    if (!data) return;
    const mid = top + hgt / 2;
    const amp = (hgt / 2 - 3) * scale;
    g.fillStyle = color;
    g.globalAlpha = alpha;
    const n = data.length;
    for (let x = Math.max(HEADER_W, Math.floor(xAt(0))); x < W; x++) {
      const i0 = Math.floor((msAt(x) / 1000) * sr);
      const i1 = Math.max(i0 + 1, Math.floor((msAt(x + 1) / 1000) * sr));
      if (i0 >= n) break;
      let mn = 0;
      let mx = 0;
      for (let i = Math.max(0, i0); i < i1 && i < n; i++) {
        const v = data[i];
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      if ((mx - mn) * scale < 0.002) continue;
      const y0 = mid - Math.min(1, mx) * amp;
      const y1 = mid - Math.max(-1, mn) * amp;
      g.fillRect(x, y0, 1, Math.max(1, y1 - y0));
    }
    g.globalAlpha = 1;
  };
  const label = (text, x, yy, color, weight = 600) => {
    g.font = `${weight} 11.5px ${font}`;
    g.fillStyle = color;
    g.fillText(text, x, yy);
  };

  const outLane = lanes[1];
  if (resB) wave(resB.mono, resB.sr, outLane.y + 6, outLane.h - 12, 1 / dbToGain(cmp.master.out), c.b, 0.35);
  if (res) wave(res.mono, res.sr, outLane.y + 6, outLane.h - 12, 1 / dbToGain(patch.master.out), c.ink, 0.85);

  const anySolo = patch.layers.some((l) => l.on && l.solo);
  for (const ln of lanes) {
    if (ln.kind !== 'layer') continue;
    const L = patch.layers.find((x) => x.id === ln.id);
    const col = c[`c-${L.type}`];
    const audible = L.on && (!anySolo || L.solo);
    const [c0, c1] = clipMs(L);
    const x0 = xAt(c0);
    const x1 = Math.max(x0 + 3, xAt(c1));
    const top = ln.y + 7;
    const bot = ln.y + ln.h - 7;
    g.fillStyle = col;
    g.globalAlpha = audible ? 0.12 : 0.05;
    roundRect(g, x0, top, x1 - x0, bot - top, 7);
    g.fill();
    g.globalAlpha = audible ? 0.6 : 0.22;
    g.strokeStyle = col;
    g.lineWidth = 1;
    roundRect(g, x0 + 0.5, top + 0.5, x1 - x0 - 1, bot - top - 1, 7);
    g.stroke();
    g.globalAlpha = 1;
    const lr = res?.layers?.get(L.id);
    if (lr && res.gain) wave(lr.data, res.sr, top, bot - top, res.gain / dbToGain(patch.master.out), col, audible ? 0.9 : 0.3);
    if (s.sel?.id === L.id) drawHandles(g, L, ln, xAt, c);
  }

  if (!patch.layers.length) {
    g.font = `13px ${font}`;
    g.fillStyle = c.muted;
    g.textAlign = 'center';
    g.fillText('No layers yet. Use Add next to Layers, or drop an audio file here.', HEADER_W + (W - HEADER_W) / 2, LANE.ruler + LANE.output + 40);
    g.textAlign = 'start';
  }

  if (playheadMs != null) {
    g.fillStyle = c.hot;
    g.fillRect(Math.round(xAt(playheadMs)), 0, 2, H);
  }
  g.restore();

  // Name column on the left, drawn last so clips never cover it.
  const fit = (text, maxW) => {
    if (g.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && g.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
    return `${t}…`;
  };
  for (const ln of lanes) {
    if (ln.kind === 'ruler') continue;
    const selected = ln.kind === 'output' ? s.sel?.kind === 'output' : s.sel?.id === ln.id;
    g.fillStyle = selected ? c['accent-soft'] : c.panel;
    g.fillRect(0, ln.y, HEADER_W, ln.h);
    g.fillStyle = c.line;
    g.fillRect(0, ln.y + ln.h - 1, HEADER_W, 1);
    if (ln.kind === 'output') {
      label('Output', 12, ln.y + 20, c.ink);
      if (res) label(`${Math.round(res.duration * 1000)} ms long`, 12, ln.y + 38, c.muted, 400);
      continue;
    }
    const L = patch.layers.find((x) => x.id === ln.id);
    const audible = L.on && (!anySolo || L.solo);
    g.fillStyle = c[`c-${L.type}`];
    g.globalAlpha = audible ? 1 : 0.4;
    roundRect(g, 12, ln.y + 13, 10, 10, 3);
    g.fill();
    g.globalAlpha = 1;
    g.font = `600 11.5px ${font}`;
    label(fit(L.name, HEADER_W - 40), 28, ln.y + 18, audible ? c.ink : c.muted);
    const state = !L.on ? 'Muted' : L.solo ? 'Solo' : anySolo ? 'Not soloed' : TYPE_LABEL[L.type];
    label(state, 28, ln.y + 36, L.solo ? c.ink : c.muted, L.solo ? 600 : 400);
  }
  g.fillStyle = c.line;
  g.fillRect(HEADER_W - 1, LANE.ruler, 1, H - LANE.ruler);
  g.fillRect(0, LANE.ruler - 1, HEADER_W, 1);
  return { lanes, xAt, msAt, W, inner };
}

function dot(g, x, y, c, r = 5) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = c.panel;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = c.hot;
  g.stroke();
}

function drawHandles(g, L, lane, xAt, c) {
  const hp = handlePoints(L, lane, xAt);
  g.lineWidth = 1.5;
  g.strokeStyle = c.hot;
  if (hp.kind === 'synth') {
    // The envelope is drawn on a dB scale, so the exponential fade is a straight line to -60 dB.
    const floorY = levelToY(L.level - 60, hp.top, hp.bot);
    let endX = hp.decay.x;
    if (floorY > hp.bot) endX = hp.hold.x + (hp.decay.x - hp.hold.x) * ((hp.bot - hp.hold.y) / (floorY - hp.hold.y));
    g.beginPath();
    g.moveTo(hp.start.x, hp.bot);
    g.lineTo(hp.peak.x, hp.peak.y);
    g.lineTo(hp.hold.x, hp.hold.y);
    g.lineTo(endX, Math.min(hp.bot, floorY));
    g.stroke();
    g.setLineDash([3, 3]);
    g.beginPath();
    g.moveTo(endX, Math.min(hp.bot, floorY));
    g.lineTo(hp.decay.x, hp.bot);
    g.stroke();
    g.setLineDash([]);
    dot(g, hp.peak.x, hp.peak.y, c);
    dot(g, hp.decay.x, hp.decay.y, c);
  } else {
    for (const p of [hp.left, hp.right]) {
      g.fillStyle = c.hot;
      roundRect(g, p.x - 2.5, hp.top, 5, hp.bot - hp.top, 2.5);
      g.fill();
    }
  }
}

function hitTest(geom, x, y) {
  if (!geom) return null;
  const lane = geom.lanes.find((l) => y >= l.y && y < l.y + l.h);
  if (!lane) return null;
  if (lane.kind !== 'layer') return { kind: lane.kind };
  if (x < HEADER_W) return { kind: 'layer', id: lane.id, part: null, lane };
  const s = useStore.getState();
  const L = currentSound(s).layers.find((l) => l.id === lane.id);
  if (!L) return null;
  const hp = handlePoints(L, lane, geom.xAt);
  const near = (p, r) => Math.hypot(p.x - x, p.y - y) <= r;
  const selected = s.sel?.id === L.id;
  if (selected && hp.kind === 'synth') {
    if (near(hp.peak, 9)) return { kind: 'layer', id: L.id, part: 'peak', lane };
    if (near(hp.decay, 10) || (Math.abs(x - hp.decay.x) < 5 && y > hp.top)) return { kind: 'layer', id: L.id, part: 'decay', lane };
  }
  if (selected && hp.kind === 'sample') {
    if (Math.abs(x - hp.left.x) < 7) return { kind: 'layer', id: L.id, part: 'trimL', lane };
    if (Math.abs(x - hp.right.x) < 7) return { kind: 'layer', id: L.id, part: 'trimR', lane };
  }
  const [c0, c1] = clipMs(L);
  const inClip = x >= geom.xAt(c0) - 2 && x <= Math.max(geom.xAt(c0) + 6, geom.xAt(c1)) + 2;
  return { kind: 'layer', id: L.id, part: inClip ? 'move' : null, lane };
}

export function zoomBy(factor, centerMs) {
  const v = effectiveView();
  const span = v.end - v.start;
  const next = Math.min(6000, Math.max(4, span / factor));
  const cMs = centerMs ?? v.start + span / 2;
  const start = Math.max(0, cMs - ((cMs - v.start) / span) * next);
  setView({ start, end: start + next, auto: false });
}

export function fitTimeline() {
  setView({ ...useStore.getState().view, auto: true });
}

export function Timeline() {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    let geom = null;
    let drag = null;
    let playhead = null;
    let raf = 0;
    let playRaf = 0;
    const redraw = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        geom = draw(canvas, wrap, playhead);
      });
    };
    const unsub = useStore.subscribe(redraw);
    const ro = new ResizeObserver(redraw);
    ro.observe(wrap);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', redraw);
    document.fonts?.ready.then(redraw);
    const unPlay = onPlay(({ t0, durMs, ctx }) => {
      cancelAnimationFrame(playRaf);
      const tick = () => {
        const ms = (ctx.currentTime - t0) * 1000;
        if (ms > durMs + 20) {
          playhead = null;
          geom = draw(canvas, wrap, null);
          return;
        }
        playhead = Math.max(0, ms);
        geom = draw(canvas, wrap, playhead);
        playRaf = requestAnimationFrame(tick);
      };
      playRaf = requestAnimationFrame(tick);
    });

    const snapMs = (v) => {
      const step = useStore.getState().snap;
      return step ? Math.round(v / step) * step : Math.round(v * 10) / 10;
    };

    const onDown = (e) => {
      const hit = hitTest(geom, e.offsetX, e.offsetY);
      if (!hit) return;
      if (hit.kind === 'output') {
        select({ kind: 'output' });
        return;
      }
      if (hit.kind !== 'layer') return;
      if (useStore.getState().sel?.id !== hit.id) select({ kind: 'layer', id: hit.id });
      if (!hit.part) return;
      const L = currentSound().layers.find((l) => l.id === hit.id);
      drag = { part: hit.part, id: hit.id, x0: e.offsetX, orig: structuredClone(L), lane: hit.lane };
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    };

    const onMove = (e) => {
      if (!drag) {
        const hit = hitTest(geom, e.offsetX, e.offsetY);
        canvas.style.cursor = !hit
          ? 'default'
          : hit.kind === 'output'
            ? 'pointer'
            : hit.part === 'peak'
              ? 'grab'
              : hit.part === 'move'
                ? 'move'
                : hit.part
                  ? 'ew-resize'
                  : 'default';
        return;
      }
      const { msAt } = geom;
      const dms = msAt(e.offsetX) - msAt(drag.x0);
      const o = drag.orig;
      const lane = drag.lane;
      editLayer(
        drag.id,
        (L) => {
          if (drag.part === 'move') L.start = Math.max(0, snapMs(o.start + dms));
          if (drag.part === 'peak') {
            L.attack = Math.min(300, Math.max(0.1, snapMs(msAt(e.offsetX) - L.start)));
            const top = lane.y + 9;
            const bot = lane.y + lane.h - 9;
            L.level = Math.round(Math.min(LEVEL_MAX_DB, Math.max(LEVEL_MIN_DB, yToLevel(e.offsetY, top, bot))) * 2) / 2;
          }
          if (drag.part === 'decay') {
            const holdEnd = L.start + L.attack + (L.type === 'modal' ? 0 : L.hold);
            L.decay = Math.min(3000, Math.max(2, snapMs(msAt(e.offsetX) - holdEnd)));
          }
          if (drag.part === 'trimL' || drag.part === 'trimR') {
            const smp = samples.get(L.sampleId);
            if (!smp) return;
            const total = sampleDurationMs(smp);
            const rate = Math.pow(2, L.pitch / 12);
            if (drag.part === 'trimL') {
              // Moves the clip's left edge while the audio stays put on the timeline.
              const dl = Math.min(Math.max(dms, -o.start, -o.trimStart / rate), (total - o.trimStart - o.trimEnd - 1) / rate);
              L.start = Math.max(0, snapMs(o.start + dl));
              L.trimStart = Math.max(0, o.trimStart + (L.start - o.start) * rate);
            } else {
              L.trimEnd = Math.max(0, Math.min(total - L.trimStart - 1, o.trimEnd - dms * rate));
            }
          }
        },
        false,
      );
    };

    const onUp = () => {
      if (!drag) return;
      drag = null;
      commit();
    };

    const onWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomBy(Math.exp(-e.deltaY * 0.01), geom ? geom.msAt(e.offsetX) : null);
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
        e.preventDefault();
        const v = effectiveView();
        const span = v.end - v.start;
        const d = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        const start = Math.max(0, v.start + (d / (geom ? geom.inner : 600)) * span);
        setView({ start, end: start + span, auto: false });
      }
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', (e) => {
      if (hitTest(geom, e.offsetX, e.offsetY)?.kind === 'ruler') fitTimeline();
    });
    redraw();
    return () => {
      unsub();
      ro.disconnect();
      media.removeEventListener('change', redraw);
      unPlay();
      cancelAnimationFrame(raf);
      cancelAnimationFrame(playRaf);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []);

  return (
    <div ref={wrapRef} className="relative min-h-[220px] flex-1 overflow-y-auto overflow-x-hidden">
      <canvas
        ref={canvasRef}
        className="block w-full touch-pan-y"
        aria-label="Timeline. Drag a block to move it. Drag the round handles to change how fast it starts, how loud it is and how long it lasts."
      />
    </div>
  );
}

const SNAP_OPTIONS = [
  { value: '0', label: 'Snap off' },
  { value: '0.5', label: 'Snap 0.5 ms' },
  { value: '1', label: 'Snap 1 ms' },
  { value: '5', label: 'Snap 5 ms' },
  { value: '10', label: 'Snap 10 ms' },
];

export function TimelineBar() {
  const snap = useStore((s) => s.snap);
  const sel = useStore((s) => s.sel);
  const isSample = useStore((s) => s.sel?.kind === 'layer' && currentSound(s).layers.find((l) => l.id === s.sel.id)?.type === 'sample');
  const tip =
    sel?.kind === 'layer'
      ? isSample
        ? 'Drag the block to move it. Drag its orange edges to trim the audio.'
        : 'Drag the block to move it. Drag the dots: the first sets how fast it starts and how loud, the second how long it lasts.'
      : 'Click a layer to edit it, or keep Output selected to shape the whole sound.';
  return (
    <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-panel px-2.5 py-1">
      <IconButton label="Zoom out" shortcut="-" size="iconSm" onClick={() => zoomBy(1 / 1.5)}>
        <Minus />
      </IconButton>
      <Button variant="ghost" size="sm" onClick={fitTimeline} title="Fit the whole sound (0)">
        <Maximize2 className="!size-3.5" />
        Fit
      </Button>
      <IconButton label="Zoom in" shortcut="=" size="iconSm" onClick={() => zoomBy(1.5)}>
        <Plus />
      </IconButton>
      <Select size="sm" label="Snap to grid" className="w-[118px] shrink-0" value={String(snap)} onChange={(v) => setPref({ snap: Number(v) })} groups={[{ items: SNAP_OPTIONS }]} />
      {/* Beside the controls when there is room, on its own row when there isn't, never cut off. */}
      <p className="min-w-0 flex-1 basis-[280px] px-1 text-[12px] leading-snug text-muted">{tip}</p>
    </div>
  );
}
