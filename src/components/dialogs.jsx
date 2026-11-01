import { useEffect, useMemo, useRef, useState } from 'react';
import { Collapsible } from 'radix-ui';
import { ChevronDown, Code2, FileAudio, FolderArchive, Mic, Package, Play, Plus, Square } from 'lucide-react';
import { presets } from '../engine/model.js';
import { decodeToSample, storeSample } from '../engine/samples.js';
import { slug } from '../engine/export.js';
import { exportSound } from '../io.js';
import { audioCtx, previewPatch, results } from '../playback.js';
import { addSampleLayer, addSound, closeDialog, currentSound, newBlankSound, showToast, useStore } from '../store.js';
import { Button, Dialog, Kbd, Segmented } from './ui.jsx';

function useDialog(name) {
  const open = useStore((s) => s.dialog === name);
  return [open, (v) => !v && closeDialog()];
}

// ---------- new sound ----------
export function NewSoundDialog() {
  const [open, onOpenChange] = useDialog('new');
  const templates = useMemo(() => presets(), [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New sound" description="Start from a template and change anything, or start blank." width={720}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <button
          type="button"
          className="flex min-h-[92px] flex-col items-start justify-between rounded-xl border border-dashed border-line-strong p-3 text-left hover:border-accent hover:bg-accent-soft/40"
          onClick={() => {
            newBlankSound();
            closeDialog();
          }}
        >
          <Plus className="size-4 text-muted" />
          <span>
            <span className="block text-[13px] font-semibold">Blank sound</span>
            <span className="block text-[12px] text-muted">One simple tone to build from.</span>
          </span>
        </button>
        {templates.map((t) => (
          <div key={t.name} className="group relative flex min-h-[92px] flex-col justify-between rounded-xl border border-line p-3 hover:border-accent hover:bg-accent-soft/40">
            <button
              type="button"
              className="absolute inset-0 rounded-xl"
              aria-label={`Use ${t.name}`}
              onClick={() => {
                addSound(t);
                closeDialog();
              }}
            />
            <span className="pointer-events-none text-[11.5px] text-faint">{t.layers.length} layer{t.layers.length > 1 ? 's' : ''}</span>
            <span className="pointer-events-none pr-8">
              <span className="block text-[13px] font-semibold">{t.name}</span>
              <span className="block text-[12px] text-muted">{t.description}</span>
            </span>
            <Button variant="secondary" size="iconSm" className="absolute right-2 top-2 z-10 rounded-full" aria-label={`Hear ${t.name}`} onClick={() => previewPatch(t)}>
              <Play className="!size-3 fill-current" />
            </Button>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

// ---------- export ----------
const WHAT = [
  { value: 'wav', icon: FileAudio, title: 'Audio file', ext: '.wav', body: 'Works everywhere: design tools, apps, games.' },
  { value: 'code', icon: Code2, title: 'Code', ext: '.js', body: 'Plays the sound in a web app with no audio file.' },
  { value: 'all', icon: Package, title: 'Everything', ext: '.zip', body: 'The audio, the code and the editable project.' },
  { value: 'project', icon: FolderArchive, title: 'Project', ext: '.json', body: 'Open it here again later, or share it.' },
];

export function ExportDialog() {
  const [open, onOpenChange] = useDialog('export');
  const P = useStore((s) => currentSound(s));
  const count = useStore((s) => s.ws.sounds.length);
  const [scope, setScope] = useState('sound');
  const [what, setWhat] = useState('wav');
  const [name, setName] = useState('');
  const [channels, setChannels] = useState(1);
  const [sampleRate, setSampleRate] = useState(48000);
  const [bits, setBits] = useState(24);
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => {
    if (open) setName(scope === 'set' ? 'sound-set' : slug(P.name));
  }, [open, scope, P.name]);

  const res = results.get(P.id);
  const ext = scope === 'set' ? '.zip' : WHAT.find((w) => w.value === what).ext;

  const run = async () => {
    setBusy(true);
    try {
      await exportSound({ what, scope, name, channels, sampleRate, bits });
      showToast('Exported. Check your downloads.');
      closeDialog();
    } catch (e) {
      console.error(e);
      showToast('Export failed. Try again, or pick a different format.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Export"
      description={scope === 'set' ? `All ${count} sounds in your set, in one .zip.` : res ? `${P.name}, ${Math.round(res.duration * 1000)} ms, peak ${P.master.out} dBFS.` : P.name}
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={closeDialog}>
            Cancel
          </Button>
          <Button variant="dark" disabled={busy || !name.trim()} onClick={run}>
            {busy ? 'Preparing...' : `Download ${ext}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Segmented
          label="Export"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'sound', label: 'This sound' },
            { value: 'set', label: `Whole set (${count})` },
          ]}
        />
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="What to export">
          {WHAT.map((w) => {
            const Icon = w.icon;
            const active = what === w.value;
            return (
              <button
                key={w.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setWhat(w.value)}
                className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${active ? 'border-accent bg-accent-soft/50' : 'border-line hover:border-line-strong hover:bg-panel-2'}`}
              >
                <Icon className={`mt-0.5 size-4 shrink-0 ${active ? 'text-accent' : 'text-muted'}`} />
                <span>
                  <span className="block text-[13px] font-semibold">
                    {w.title} <span className="font-mono text-[11.5px] font-normal text-muted">{scope === 'set' ? 'in .zip' : w.ext}</span>
                  </span>
                  <span className="block text-[12px] text-muted">{w.body}</span>
                </span>
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-2 text-[12.5px] text-muted">
          <span className="w-[68px] shrink-0">File name</span>
          <span className="flex flex-1 items-center rounded-[7px] bg-field pr-2 focus-within:ring-1 focus-within:ring-accent">
            <input value={name} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1 bg-transparent px-2.5 py-1.5 text-[13px] text-ink outline-none" />
            <span className="font-mono text-[12px] text-faint">{ext}</span>
          </span>
        </label>
        {what !== 'project' && what !== 'code' && (
          <Collapsible.Root open={advanced} onOpenChange={setAdvanced}>
            <Collapsible.Trigger className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-ink">
              Audio format: {channels === 1 ? 'mono' : 'stereo'}, {sampleRate / 1000} kHz, {bits}-bit
              <ChevronDown className={`size-3.5 transition-transform ${advanced ? 'rotate-180' : ''}`} />
            </Collapsible.Trigger>
            <Collapsible.Content className="mt-3 flex flex-col gap-2">
              <Segmented
                label="Channels"
                value={channels}
                onChange={setChannels}
                hint="Mono is right for almost every UI sound."
                options={[
                  { value: 1, label: 'Mono' },
                  { value: 2, label: 'Stereo' },
                ]}
              />
              <Segmented
                label="Sample rate"
                value={sampleRate}
                onChange={setSampleRate}
                options={[
                  { value: 48000, label: '48 kHz' },
                  { value: 44100, label: '44.1 kHz' },
                ]}
              />
              <Segmented
                label="Bit depth"
                value={bits}
                onChange={setBits}
                options={[
                  { value: 24, label: '24-bit' },
                  { value: 16, label: '16-bit' },
                ]}
              />
              <p className="text-[12px] text-muted">Need MP3 or OGG? Export a WAV and convert it. MP3 can add a few milliseconds of silence at the start, which makes UI sounds feel late.</p>
            </Collapsible.Content>
          </Collapsible.Root>
        )}
      </div>
    </Dialog>
  );
}

// ---------- record ----------
const MAX_RECORD_MS = 10000;

export function RecordDialog() {
  const [open, onOpenChange] = useDialog('record');
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState('Tap a desk, a cup or a key near your microphone. Recording stops after 10 seconds.');
  const [level, setLevel] = useState(0);
  const rec = useRef({});

  const stop = () => {
    const r = rec.current;
    cancelAnimationFrame(r.raf);
    clearTimeout(r.timer);
    if (r.recorder?.state === 'recording') r.recorder.stop();
    r.stream?.getTracks().forEach((t) => t.stop());
    setLevel(0);
  };

  useEffect(() => {
    if (!open) {
      // Closing mid-recording discards the take instead of adding it.
      rec.current.cancelled = true;
      stop();
      setState('idle');
    }
  }, [open]);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMessage('This browser cannot record audio. Add an audio file instead.');
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch {
      setMessage('Microphone access was blocked. Allow it in your browser settings and try again.');
      return;
    }
    const c = audioCtx();
    const analyser = c.createAnalyser();
    analyser.fftSize = 1024;
    c.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const chunks = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = async () => {
      if (rec.current.cancelled) return;
      setState('saving');
      try {
        const blob = new Blob(chunks, { type: recorder.mimeType });
        const n = useStore.getState().ws.sounds.reduce((acc, s) => acc + s.layers.filter((l) => /^Recording/.test(l.name)).length, 0) + 1;
        const sample = await decodeToSample(await blob.arrayBuffer(), `Recording ${n}`);
        storeSample(sample);
        addSampleLayer(sample);
        showToast('Recording added as a layer. It starts where the sound begins.');
        closeDialog();
      } catch {
        setMessage('That recording could not be read. Try again.');
        setState('idle');
      }
    };
    rec.current = { stream, recorder, t0: performance.now(), cancelled: false };
    recorder.start();
    setState('recording');
    const tick = () => {
      analyser.getFloatTimeDomainData(buf);
      let pk = 0;
      for (let i = 0; i < buf.length; i++) pk = Math.max(pk, Math.abs(buf[i]));
      setLevel(Math.max(0, Math.min(1, (20 * Math.log10(pk || 1e-9) + 60) / 60)));
      setMessage(`Recording ${((performance.now() - rec.current.t0) / 1000).toFixed(1)} s`);
      rec.current.raf = requestAnimationFrame(tick);
    };
    tick();
    rec.current.timer = setTimeout(stop, MAX_RECORD_MS);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Record a sound" description="Your recording becomes a layer you can trim, pitch and shape." width={420}>
      <div className="flex flex-col items-center gap-4 py-2">
        <button
          type="button"
          onClick={state === 'recording' ? stop : start}
          disabled={state === 'saving'}
          className={`grid size-20 place-items-center rounded-full text-panel shadow-pop transition-transform active:scale-95 ${state === 'recording' ? 'bg-hot motion-safe:animate-[pulse-soft_1s_ease-in-out_infinite]' : 'bg-hot hover:brightness-110'}`}
          aria-label={state === 'recording' ? 'Stop recording' : 'Start recording'}
        >
          {state === 'recording' ? <Square className="size-6 fill-current" /> : <Mic className="size-7" />}
        </button>
        <div className="h-2 w-full overflow-hidden rounded-full bg-field" aria-hidden="true">
          <div className="h-full rounded-full bg-hot transition-[width] duration-75" style={{ width: `${level * 100}%` }} />
        </div>
        <p className="text-center text-[12.5px] text-muted" role="status">
          {state === 'saving' ? 'Adding your recording...' : message}
        </p>
      </div>
    </Dialog>
  );
}

// ---------- shortcuts ----------
const SHORTCUTS = [
  ['Space', 'Play the current sound'],
  ['B', 'Play the comparison'],
  ['L', 'Loop on or off'],
  ['⌘Z / ⇧⌘Z', 'Undo / redo'],
  ['⌘C / ⌘V', 'Copy / paste a layer, also into another sound'],
  ['⌘D', 'Duplicate the selected layer'],
  ['Delete', 'Delete the selected layer'],
  ['M / S', 'Mute / solo the selected layer'],
  ['= / - / 0', 'Zoom in / out / fit'],
  ['⌘ + scroll', 'Zoom the timeline where you point'],
  ['Esc', 'Select Output'],
  ['Drag a slider', 'Change a value. Click the number to type it.'],
  ['Drop a file', 'Add audio as a layer, or open a project'],
];

export function ShortcutsDialog() {
  const [open, onOpenChange] = useDialog('shortcuts');
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Keyboard shortcuts" width={480}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2.5">
        {SHORTCUTS.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-right">
              <Kbd>{k}</Kbd>
            </dt>
            <dd className="m-0 text-[13px]">{v}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
