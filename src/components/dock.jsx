import { useEffect, useMemo, useRef } from 'react';
import { Slider, Tabs } from 'radix-ui';
import { Copy } from 'lucide-react';
import { dbToGain } from '../engine/engine.js';
import { moduleSource } from '../engine/export.js';
import { fmtHz, fmtHzUnit, fmtLevel, fmtPan } from '../lib/format.js';
import { comparePatch, results } from '../playback.js';
import { commit, currentSound, editLayer, editMaster, select, setPref, showToast, useStore } from '../store.js';
import { Button, hintProps } from './ui.jsx';
import { LayerIcon } from './icons.jsx';

const SPEC_FLOOR_DB = -72;
const F_MIN = 40;
const F_MAX = 20000;

function drawSpectrum(canvas) {
  const box = canvas.parentElement;
  const W = box.clientWidth;
  const H = box.clientHeight;
  if (!W || !H) return;
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  canvas.style.height = `${H}px`;
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const cs = getComputedStyle(document.documentElement);
  const col = (k) => cs.getPropertyValue(`--${k}`).trim();
  const font = getComputedStyle(document.body).fontFamily;
  const s = useStore.getState();
  const a = results.get(currentSound(s).id);
  const cmp = comparePatch(s);
  const b = cmp ? results.get(cmp.id) : null;
  const padL = 36;
  const padR = 16;
  const padT = 14;
  const padB = 22;
  const xAtF = (f) => padL + (Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN)) * (W - padL - padR);
  const fAtX = (x) => F_MIN * Math.pow(F_MAX / F_MIN, (x - padL) / (W - padL - padR));
  const yAtDb = (db) => padT + (Math.min(0, Math.max(SPEC_FLOOR_DB, db)) / SPEC_FLOOR_DB) * (H - padT - padB);
  g.font = `11px ${font}`;
  g.textBaseline = 'middle';
  for (const db of [0, -24, -48, -72]) {
    const y = Math.round(yAtDb(db)) + 0.5;
    g.fillStyle = col('line');
    g.fillRect(padL, y, W - padL - padR, 1);
    g.fillStyle = col('muted');
    g.fillText(String(db), 6, y);
  }
  let lastX = -99;
  for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]) {
    const x = Math.round(xAtF(f)) + 0.5;
    g.fillStyle = col('line');
    g.fillRect(x, padT, 1, H - padT - padB);
    if (x - lastX > 32) {
      g.fillStyle = col('muted');
      g.fillText(fmtHz(f), x - 9, H - 10);
      lastX = x;
    }
  }
  const curve = (res) => {
    const { mag, max, binHz } = res.spectrum;
    if (!max) return [];
    const pts = [];
    for (let x = padL; x <= W - padR; x++) {
      const k0 = Math.max(1, Math.floor(fAtX(x) / binHz));
      const k1 = Math.max(k0 + 1, Math.ceil(fAtX(x + 1) / binHz));
      let m = 0;
      for (let k = k0; k < k1 && k < mag.length; k++) if (mag[k] > m) m = mag[k];
      pts.push([x, yAtDb(20 * Math.log10((m || 1e-12) / max))]);
    }
    return pts;
  };
  const stroke = (pts, color, dash) => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.strokeStyle = color;
    g.lineWidth = 1.5;
    g.setLineDash(dash || []);
    g.stroke();
    g.setLineDash([]);
  };
  if (a) {
    const pts = curve(a);
    if (pts.length) {
      g.beginPath();
      g.moveTo(pts[0][0], yAtDb(SPEC_FLOOR_DB));
      pts.forEach(([x, y]) => g.lineTo(x, y));
      g.lineTo(pts[pts.length - 1][0], yAtDb(SPEC_FLOOR_DB));
      g.closePath();
      g.fillStyle = col('accent-soft');
      g.fill();
      stroke(pts, col('accent'));
    }
  }
  if (b) stroke(curve(b), col('b'), [4, 3]);
  const marker = (res, color, row) => {
    if (!res?.m.centroid) return;
    const x = Math.round(xAtF(Math.max(F_MIN, res.m.centroid))) + 0.5;
    g.fillStyle = color;
    g.fillRect(x, padT, 1.5, H - padT - padB);
    g.font = `600 11px ${font}`;
    const text = `brightness ${fmtHzUnit(res.m.centroid)}`;
    const tw = g.measureText(text).width;
    g.fillText(text, Math.min(x + 6, W - padR - tw), padT + 7 + row * 14);
  };
  marker(a, col('hot'), 0);
  marker(b, col('b'), 1);
}

function Spectrum() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    let raf = 0;
    const redraw = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => drawSpectrum(canvas));
    };
    const unsub = useStore.subscribe((s, p) => {
      if (s.resultsVersion !== p.resultsVersion || s.theme !== p.theme || s.compare !== p.compare) redraw();
    });
    const ro = new ResizeObserver(redraw);
    ro.observe(canvas.parentElement);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', redraw);
    redraw();
    return () => {
      unsub();
      ro.disconnect();
      media.removeEventListener('change', redraw);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div className="relative h-full w-full">
      <canvas ref={ref} className="block w-full" aria-label="Frequency chart of the current sound. Lows on the left, highs on the right." />
    </div>
  );
}

function VFader({ label, value, min, max, onChange }) {
  return (
    <Slider.Root
      orientation="vertical"
      min={min}
      max={max}
      step={0.1}
      value={[value]}
      onValueChange={([v]) => onChange(v)}
      // Radix commits keyboard steps before it reports the new value, so wait for the change.
      onValueCommit={() => queueMicrotask(commit)}
      className="relative flex h-[96px] w-6 touch-none select-none justify-center"
    >
      <Slider.Track className="relative w-1.5 grow overflow-hidden rounded-full bg-field">
        <Slider.Range className="absolute w-full rounded-full bg-accent/50" />
      </Slider.Track>
      <Slider.Thumb aria-label={label} className="block h-2.5 w-5 rounded-[4px] border border-line-strong bg-panel shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/40" />
    </Slider.Root>
  );
}

function PanSlider({ label, value, onChange, onReset }) {
  const pct = ((value + 1) / 2) * 100;
  return (
    <Slider.Root
      min={-1}
      max={1}
      step={0.01}
      value={[value]}
      onValueChange={([v]) => onChange(Math.abs(v) < 0.03 ? 0 : v)}
      // Radix commits keyboard steps before it reports the new value, so wait for the change.
      onValueCommit={() => queueMicrotask(commit)}
      onDoubleClick={onReset}
      title={`Left / right: ${fmtPan(value)}. Double-click to center.`}
      className="relative flex h-4 w-16 touch-none select-none items-center"
    >
      <Slider.Track className="relative h-1 grow rounded-full bg-field">
        <div className="absolute inset-y-0 rounded-full bg-muted/60" style={{ left: `${Math.min(50, pct)}%`, width: `${Math.abs(pct - 50)}%` }} />
        <div className="absolute inset-y-[-2px] left-1/2 w-px bg-line-strong" />
      </Slider.Track>
      <Slider.Thumb aria-label={label} aria-valuetext={fmtPan(value)} className="block size-3 rounded-full border border-line-strong bg-panel shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/40" />
    </Slider.Root>
  );
}

function Meter({ linear, color, title }) {
  const db = 20 * Math.log10(linear || 1e-9);
  const pct = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
  return (
    <div className="relative h-[96px] w-1.5 overflow-hidden rounded-full bg-field" title={title ?? `Peak: ${fmtLevel(db, 'dBFS')}`}>
      <div className="absolute inset-x-0 bottom-0 rounded-full" style={{ height: `${pct}%`, background: color }} />
    </div>
  );
}

function Mixer() {
  const P = useStore((s) => currentSound(s));
  const sel = useStore((s) => s.sel);
  useStore((s) => s.resultsVersion);
  const res = results.get(P.id);
  return (
    <div className="flex h-full gap-2 overflow-x-auto px-3 py-2">
      {P.layers.map((L) => {
        const lr = res?.layers?.get(L.id);
        const selected = sel?.kind === 'layer' && sel.id === L.id;
        return (
          <div key={L.id} className={`flex w-[92px] shrink-0 flex-col items-center gap-1 rounded-xl border p-1.5 [&>*]:shrink-0 ${selected ? 'border-accent bg-accent-soft/40' : 'border-line bg-panel-2'}`}>
            <button type="button" className="flex w-full items-center justify-center gap-1 truncate text-[12px] font-medium" onClick={() => select({ kind: 'layer', id: L.id })}>
              <span className="shrink-0" style={{ color: `var(--c-${L.type})` }}>
                <LayerIcon type={L.type} className="size-3" />
              </span>
              <span className="truncate">{L.name}</span>
            </button>
            <div className="flex items-end gap-1.5" {...hintProps('Volume', 'Drag the fader to set how loud this layer is. The bar beside it shows how loud it actually peaks.')}>
              <VFader label={`${L.name} volume`} value={L.level} min={-48} max={6} onChange={(v) => editLayer(L.id, (d) => void (d.level = Math.round(v * 10) / 10), false)} />
              <Meter linear={lr && res.gain ? lr.peak * res.gain : 0} color={`var(--c-${L.type})`} />
            </div>
            <span className="font-mono text-[11px] text-muted tabular">{`${L.level > 0 ? '+' : ''}${L.level.toFixed(1)} dB`}</span>
            <PanSlider label={`${L.name} left or right`} value={L.pan} onChange={(v) => editLayer(L.id, (d) => void (d.pan = v), false)} onReset={() => editLayer(L.id, (d) => void (d.pan = 0))} />
            <div className="flex gap-1">
              <button
                type="button"
                aria-pressed={!L.on}
                aria-label={`Mute ${L.name}`}
                title="Mute"
                className={`h-5 w-6 rounded border font-mono text-[10px] font-semibold ${!L.on ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-panel text-muted'}`}
                onClick={() => editLayer(L.id, (d) => void (d.on = !d.on))}
              >
                M
              </button>
              <button
                type="button"
                aria-pressed={L.solo}
                aria-label={`Solo ${L.name}`}
                title="Solo"
                className={`h-5 w-6 rounded border font-mono text-[10px] font-semibold ${L.solo ? 'border-hot bg-hot text-panel' : 'border-line bg-panel text-muted'}`}
                onClick={() => editLayer(L.id, (d) => void (d.solo = !d.solo))}
              >
                S
              </button>
            </div>
          </div>
        );
      })}
      <div className={`flex w-[92px] shrink-0 flex-col items-center gap-1 rounded-xl border p-1.5 [&>*]:shrink-0 ${sel?.kind === 'output' ? 'border-accent bg-accent-soft/40' : 'border-line-strong bg-panel-2'}`}>
        <button type="button" className="text-[12px] font-semibold" onClick={() => select({ kind: 'output' })}>
          Output
        </button>
        <div className="flex items-end gap-1.5" {...hintProps('Loudness', 'Sets how loud the finished sound peaks. The bar shows the result.')}>
          <VFader label="Output loudness" value={P.master.out} min={-40} max={-1} onChange={(v) => editMaster((d) => void (d.out = Math.round(v * 2) / 2), false)} />
          <Meter linear={res ? dbToGain(res.m.peakDb) : 0} color="var(--ink)" />
        </div>
        <span className="font-mono text-[11px] text-muted tabular">{`${P.master.out.toFixed(1)} dBFS`}</span>
        <span className="text-[11px] text-muted">peak</span>
      </div>
    </div>
  );
}

function Code() {
  const P = useStore((s) => currentSound(s));
  const version = useStore((s) => s.resultsVersion);
  const src = useMemo(() => moduleSource(P, results.get(P.id), { abbreviateSamples: true }), [P, version]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(moduleSource(P, results.get(P.id)));
      showToast('Copied. Paste it into a .js file in your app.');
    } catch {
      showToast('Copying was blocked. Use Export > Code instead.');
    }
  };
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-3 py-2">
        <p className="text-[12px] text-muted">
          A JavaScript file that plays this sound in any web app, with no audio file. Call <code className="rounded bg-field px-1 font-mono text-[11.5px] text-ink">playSound(audioContext)</code>.
        </p>
        <Button size="sm" variant="outline" className="ml-auto" onClick={copy}>
          <Copy className="!size-3.5" />
          Copy code
        </Button>
      </div>
      <pre className="min-h-0 flex-1 overflow-auto px-3 pb-3 font-mono text-[11.5px] leading-relaxed text-ink">{src}</pre>
    </div>
  );
}

function Legend() {
  const name = useStore((s) => currentSound(s).name);
  const cmp = useStore((s) => comparePatch(s));
  return (
    <div className="ml-auto hidden items-center gap-3 pr-1 text-[12px] text-muted sm:flex">
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-3 rounded bg-accent" />
        {name}
      </span>
      {cmp && (
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded bg-b" />
          {cmp.name}
        </span>
      )}
    </div>
  );
}

export function Dock() {
  const dock = useStore((s) => s.dock);
  return (
    <Tabs.Root value={dock} onValueChange={(v) => setPref({ dock: v })} className="flex h-[264px] shrink-0 flex-col border-t border-line bg-panel">
      <Tabs.List className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-2" aria-label="Views">
        {[
          ['spectrum', 'Frequencies'],
          ['mixer', 'Mixer'],
          ['code', 'Code'],
        ].map(([value, label]) => (
          <Tabs.Trigger
            key={value}
            value={value}
            className="relative h-10 px-2.5 text-[12.5px] font-medium text-muted hover:text-ink data-[state=active]:text-ink data-[state=active]:after:absolute data-[state=active]:after:inset-x-2 data-[state=active]:after:bottom-0 data-[state=active]:after:h-0.5 data-[state=active]:after:rounded-full data-[state=active]:after:bg-ink"
          >
            {label}
          </Tabs.Trigger>
        ))}
        {dock === 'spectrum' && <Legend />}
      </Tabs.List>
      <Tabs.Content value="spectrum" className="min-h-0 flex-1 outline-none">
        <Spectrum />
      </Tabs.Content>
      <Tabs.Content value="mixer" className="min-h-0 flex-1 outline-none">
        <Mixer />
      </Tabs.Content>
      <Tabs.Content value="code" className="min-h-0 flex-1 outline-none">
        <Code />
      </Tabs.Content>
    </Tabs.Root>
  );
}

const METRICS = [
  { key: 'audibleMs', label: 'Length', fmt: (v) => `${Math.round(v)} ms`, hint: 'How long you can hear the sound, down to 40 dB below its peak. Most UI sounds are under 200 ms.' },
  { key: 'onsetMs', label: 'Starts after', fmt: (v) => `${v.toFixed(1)} ms`, hint: 'Silence before the sound begins. For taps and clicks this should be close to 0 so the sound lands with the action.' },
  { key: 'peakDb', label: 'Peak', fmt: (v) => fmtLevel(v), hint: 'The loudest point, in dBFS. Set it with Loudness on Output.' },
  { key: 'rmsDb', label: 'Average', fmt: (v) => fmtLevel(v), hint: 'Average loudness over the whole sound (RMS). Two sounds with the same peak can feel very different here.' },
  { key: 'centroid', label: 'Brightness', fmt: fmtHzUnit, hint: 'The center of the sound’s frequencies (spectral centroid). Higher reads as brighter and lighter.' },
  { key: 'lowShare', label: 'Bass', fmt: (v) => `${Math.round(v * 100)}%`, hint: 'How much of the energy is below 250 Hz. Lower reads as lighter; small speakers lose most of it anyway.' },
];

export function MetricsBar() {
  const P = useStore((s) => currentSound(s));
  const cmp = useStore((s) => comparePatch(s));
  useStore((s) => s.resultsVersion);
  const a = results.get(P.id);
  const b = cmp ? results.get(cmp.id) : null;
  return (
    <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-x-5 gap-y-1 border-t border-line bg-panel px-3 py-1.5">
      {a &&
        METRICS.map((m) => (
          <div key={m.key} className="flex items-baseline gap-1.5 text-[12px]" {...hintProps(m.label, m.hint)}>
            <span className="text-muted">{m.label}</span>
            <span className="font-mono font-medium tabular">{m.fmt(a.m[m.key])}</span>
            {b && <span className="font-mono text-[11.5px] text-b tabular">{m.fmt(b.m[m.key])}</span>}
          </div>
        ))}
    </div>
  );
}
