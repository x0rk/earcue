import { useEffect, useMemo, useRef, useState } from 'react';
import { Collapsible, RadioGroup } from 'radix-ui';
import { ChevronDown, Code2, FileAudio, FolderArchive, Mic, Package, Play, Plus, Square } from 'lucide-react';
import { REPO_URL } from '../brand.js';
import { LOUDNESS_RANGE, presets, starterSounds } from '../engine/model.js';
import { describeKey, SCALES, TIER_LABEL, tierOf, widerKey } from '../engine/palette.js';
import { decodeToSample, storeSample } from '../engine/samples.js';
import { slug } from '../engine/export.js';
import { exportSound } from '../io.js';
import { NOTE_NAMES } from '../lib/format.js';
import { audioCtx, previewPatch, results } from '../playback.js';
import { addSampleLayer, addSound, changeKey, closeDialog, currentSound, newBlankSound, setLoudness, setPref, shareRoom, showToast, useStore } from '../store.js';
import { Button, Dialog, Kbd, Scrub, Segmented, Select, SwitchRow } from './ui.jsx';

function useDialog(name) {
  const open = useStore((s) => s.dialog === name);
  return [open, (v) => !v && closeDialog()];
}

// ---------- new sound ----------
function TemplateCard({ t }) {
  return (
    // Every card starts its title at the same height, however long its description runs.
    <div className="group relative flex min-h-[92px] flex-col gap-2 rounded-xl border border-line p-3 hover:border-accent hover:bg-accent-soft/40">
      <button
        type="button"
        className="absolute inset-0 rounded-xl"
        aria-label={`Use ${t.name}`}
        onClick={() => {
          addSound(t);
          closeDialog();
        }}
      />
      <span className="pointer-events-none flex h-4 items-center text-[11.5px] text-muted">{t.layers.length} layer{t.layers.length > 1 ? 's' : ''}</span>
      <span className="pointer-events-none pr-8">
        <span className="block text-[13px] font-semibold">{t.name}</span>
        <span className="block text-[12px] text-muted">{t.description}</span>
      </span>
      <Button variant="secondary" size="iconSm" className="absolute right-2 top-2 z-10 rounded-full" aria-label={`Hear ${t.name}`} onClick={() => previewPatch(t)}>
        <Play className="!size-3 fill-current" />
      </Button>
    </div>
  );
}

const GRID = 'grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3';

export function NewSoundDialog() {
  const [open, onOpenChange] = useDialog('new');
  const basics = useMemo(() => starterSounds(), [open]);
  const templates = useMemo(() => presets(), [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New sound" description="Start from a template and change anything, or start blank." width={720}>
      <div className={GRID}>
        <button
          type="button"
          className="flex min-h-[92px] flex-col items-start gap-2 rounded-xl border border-dashed border-line-strong p-3 text-left hover:border-accent hover:bg-accent-soft/40"
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
      </div>
      <h3 className="mb-2 mt-5 text-[12px] font-semibold text-ink">The basics</h3>
      <div className={GRID}>
        {basics.map((t) => (
          <TemplateCard key={t.name} t={t} />
        ))}
      </div>
      <h3 className="mb-2 mt-5 text-[12px] font-semibold text-ink">More templates</h3>
      <div className={GRID}>
        {templates.map((t) => (
          <TemplateCard key={t.name} t={t} />
        ))}
      </div>
    </Dialog>
  );
}

// ---------- export ----------
const WHAT = [
  { value: 'audio', icon: FileAudio, title: 'Audio file', body: 'For design tools, apps and games.' },
  { value: 'code', icon: Code2, title: 'Code', ext: '.js', body: 'Plays the sound in a web app with no audio file.' },
  { value: 'all', icon: Package, title: 'Everything', ext: '.zip', body: 'The audio, the code and the editable project.' },
  { value: 'project', icon: FolderArchive, title: 'Project', ext: '.json', body: 'Open it here again later, or share it.' },
];

const FORMAT_NOTE = {
  wav: 'Lossless. Opens in every design tool, audio app and game engine.',
  ogg: 'Much smaller than a WAV. Plays in current browsers, on Android and in game engines like Godot and Unity. Safari needs version 18.4 or later.',
};

export function ExportDialog() {
  const [open, onOpenChange] = useDialog('export');
  const P = useStore((s) => currentSound(s));
  const sounds = useStore((s) => s.ws.sounds);
  const soundSetName = useStore((s) => s.ws.name);
  const credits = useStore((s) => s.ws.credits);
  const count = sounds.length;
  const [scope, setScope] = useState('sound');
  const [what, setWhat] = useState('audio');
  const [format, setFormat] = useState('wav');
  const [name, setName] = useState('');
  const [channels, setChannels] = useState(1);
  const [sampleRate, setSampleRate] = useState(48000);
  const [bits, setBits] = useState(24);
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => {
    if (open) setName(slug(scope === 'set' ? soundSetName : P.name));
  }, [open, scope, P.name, soundSetName]);

  const res = results.get(P.id);
  const hasAudio = what === 'audio' || what === 'all';
  const extOf = (w) => w.ext || `.${format}`;
  const ext = scope === 'set' ? '.zip' : extOf(WHAT.find((w) => w.value === what));
  const empty = scope === 'sound' && !P.layers.length;
  const keepsClips = (what === 'project' || what === 'all') && (scope === 'set' ? sounds : [P]).some((p) => p.layers.some((L) => L.type === 'sample'));

  const run = async () => {
    setBusy(true);
    try {
      await exportSound({ what, scope, name, format, channels, sampleRate, bits });
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
      description={
        scope === 'set'
          ? `All ${count} sounds in ${soundSetName}, in one .zip.`
          : empty
            ? `${P.name} has no layers yet, so there is nothing to export.`
            : res
              ? `${P.name}, ${Math.round(res.duration * 1000)} ms, peak ${P.master.out} dBFS.`
              : P.name
      }
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={closeDialog}>
            Cancel
          </Button>
          <Button variant="dark" disabled={busy || !name.trim() || empty} onClick={run}>
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
        <RadioGroup.Root className="grid grid-cols-2 gap-2" aria-label="What to export" value={what} onValueChange={setWhat}>
          {WHAT.map((w) => {
            const Icon = w.icon;
            const active = what === w.value;
            return (
              <RadioGroup.Item
                key={w.value}
                value={w.value}
                // In a radio group the focused option is the chosen one, however focus got there.
                onFocus={() => setWhat(w.value)}
                className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${active ? 'border-accent bg-accent-soft/50' : 'border-line hover:border-line-strong hover:bg-panel-2'}`}
              >
                <Icon className={`mt-0.5 size-4 shrink-0 ${active ? 'text-accent' : 'text-muted'}`} />
                <span>
                  <span className="block text-[13px] font-semibold">
                    {w.title} <span className="font-mono text-[11.5px] font-normal text-muted">{scope === 'set' ? 'in .zip' : extOf(w)}</span>
                  </span>
                  <span className="block text-[12px] text-muted">{w.body}</span>
                </span>
              </RadioGroup.Item>
            );
          })}
        </RadioGroup.Root>
        {hasAudio && (
          <div className="flex flex-col gap-1.5">
            <Segmented
              label="File type"
              value={format}
              onChange={setFormat}
              options={[
                { value: 'wav', label: 'WAV' },
                { value: 'ogg', label: 'OGG' },
              ]}
            />
            <p className="pl-[76px] text-[12px] text-muted">{FORMAT_NOTE[format]}</p>
          </div>
        )}
        {credits.length > 0 && (
          <p className="text-[12px] text-muted">
            This set uses recordings from {credits.join(' ')} Zip exports carry the credit in their README. When you share a single file, credit it yourself.
          </p>
        )}
        {keepsClips && <p className="text-[12px] text-muted">Project files keep each recording whole, trimmed parts included, so you can change the trims later. Code exports include only the part that plays.</p>}
        <label className="flex items-center gap-2 text-[12.5px] text-muted">
          <span className="w-[68px] shrink-0">File name</span>
          <span className="flex flex-1 items-center rounded-[7px] bg-field pr-2 focus-within:ring-1 focus-within:ring-accent">
            <input value={name} spellCheck={false} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1 bg-transparent px-2.5 py-1.5 text-[13px] text-ink outline-none" />
            <span className="font-mono text-[12px] text-muted">{ext}</span>
          </span>
        </label>
        {hasAudio && (
          <Collapsible.Root open={advanced} onOpenChange={setAdvanced}>
            <Collapsible.Trigger className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-ink">
              Audio format: {channels === 1 ? 'mono' : 'stereo'}, {sampleRate / 1000} kHz{format === 'wav' ? `, ${bits}-bit` : ''}
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
              {format === 'wav' && (
                <Segmented
                  label="Bit depth"
                  value={bits}
                  onChange={setBits}
                  options={[
                    { value: 24, label: '24-bit' },
                    { value: 16, label: '16-bit' },
                  ]}
                />
              )}
              <p className="text-[12px] text-muted">Need an MP3? Export a WAV and convert it. MP3 can add a few milliseconds of silence at the start, which makes UI sounds feel late.</p>
            </Collapsible.Content>
          </Collapsible.Root>
        )}
      </div>
    </Dialog>
  );
}

// ---------- record ----------
const MAX_RECORD_MS = 10000;
const RECORD_INTRO = `Tap a desk, a cup or a key near your microphone. Recording stops after ${MAX_RECORD_MS / 1000} seconds.`;

// Browsers name their microphones only after you allow one, so the list fills in after the first recording.
function useMicrophones(open) {
  const [mics, setMics] = useState([]);
  const list = async () => {
    try {
      const all = (await navigator.mediaDevices?.enumerateDevices?.()) || [];
      setMics(all.filter((d) => d.kind === 'audioinput' && d.deviceId && !['default', 'communications'].includes(d.deviceId)));
    } catch {
      setMics([]);
    }
  };
  useEffect(() => {
    if (!open) return undefined;
    list();
    navigator.mediaDevices?.addEventListener?.('devicechange', list);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', list);
  }, [open]);
  return [mics, list];
}

export function RecordDialog() {
  const [open, onOpenChange] = useDialog('record');
  const [mics, refreshMics] = useMicrophones(open);
  const micId = useStore((s) => s.micId);
  const chosenMic = mics.some((m) => m.deviceId === micId) ? micId : null;
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState(RECORD_INTRO);
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);
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
      // Closing mid-recording, or while the browser is still asking for the microphone, discards the take.
      rec.current.cancelled = true;
      stop();
      setState('idle');
      setMessage(RECORD_INTRO);
    }
  }, [open]);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMessage('This browser cannot record audio. Add an audio file instead.');
      return;
    }
    // Each attempt gets its own record, so closing the dialog during the permission prompt cancels this one.
    const attempt = { cancelled: false };
    rec.current = attempt;
    setState('starting');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, ...(chosenMic ? { deviceId: { exact: chosenMic } } : {}) },
      });
      refreshMics();
    } catch {
      if (attempt.cancelled) return;
      setMessage('Microphone access was blocked. Allow it in your browser settings and try again.');
      setState('idle');
      return;
    }
    if (attempt.cancelled) {
      stream.getTracks().forEach((t) => t.stop());
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
      if (attempt.cancelled) return;
      setState('saving');
      try {
        const blob = new Blob(chunks, { type: recorder.mimeType });
        const n = useStore.getState().ws.sounds.reduce((acc, s) => acc + s.layers.filter((l) => /^Recording/.test(l.name)).length, 0) + 1;
        const sample = await decodeToSample(await blob.arrayBuffer(), `Recording ${n}`);
        storeSample(sample);
        if (addSampleLayer(sample)) showToast('Recording added as a layer. It starts where the sound begins.');
        closeDialog();
      } catch {
        setMessage('That recording could not be read. Try again.');
        setState('idle');
      }
    };
    Object.assign(attempt, { stream, recorder, t0: performance.now() });
    recorder.start();
    setState('recording');
    setMessage('Recording. Press the button again to stop.');
    const tick = () => {
      analyser.getFloatTimeDomainData(buf);
      let pk = 0;
      for (let i = 0; i < buf.length; i++) pk = Math.max(pk, Math.abs(buf[i]));
      setLevel(Math.max(0, Math.min(1, (20 * Math.log10(pk || 1e-9) + 60) / 60)));
      setSeconds((performance.now() - attempt.t0) / 1000);
      attempt.raf = requestAnimationFrame(tick);
    };
    tick();
    attempt.timer = setTimeout(stop, MAX_RECORD_MS);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Record a sound" description="Your recording becomes a layer you can trim, pitch and shape." width={420}>
      <div className="flex flex-col items-center gap-4 py-2">
        <button
          type="button"
          onClick={state === 'recording' ? stop : start}
          disabled={state === 'saving' || state === 'starting'}
          className={`grid size-20 place-items-center rounded-full text-panel shadow-pop transition-transform active:scale-95 ${state === 'recording' ? 'bg-hot motion-safe:animate-[pulse-soft_1s_ease-in-out_infinite]' : 'bg-hot hover:brightness-110'}`}
          aria-label={state === 'recording' ? 'Stop recording' : 'Start recording'}
        >
          {state === 'recording' ? <Square className="size-6 fill-current" /> : <Mic className="size-7" />}
        </button>
        <div className="h-2 w-full overflow-hidden rounded-full bg-field" aria-hidden="true">
          <div className="h-full rounded-full bg-hot transition-[width] duration-75" style={{ width: `${level * 100}%` }} />
        </div>
        {/* The running time stays out of the status region, which only announces changes of state. */}
        {state === 'recording' && (
          <p className="font-mono text-[12px] text-muted tabular" aria-hidden="true">
            {seconds.toFixed(1)} s
          </p>
        )}
        <p className="text-center text-[12.5px] text-muted" role="status">
          {state === 'saving' ? 'Adding your recording...' : state === 'starting' ? 'Waiting for the microphone...' : message}
        </p>
        {mics.length > 1 && (
          <div className="w-full">
            <Select
              label="Microphone"
              size="sm"
              className="w-full"
              value={chosenMic || 'default'}
              groups={[{ items: [{ value: 'default', label: 'Default microphone' }, ...mics.map((m, i) => ({ value: m.deviceId, label: m.label || `Microphone ${i + 1}` }))] }]}
              onChange={(v) => setPref({ micId: v === 'default' ? null : v })}
            />
          </div>
        )}
      </div>
    </Dialog>
  );
}

// ---------- palette ----------
const capitalized = (s) => s[0].toUpperCase() + s.slice(1);
const ROOT_ITEMS = NOTE_NAMES.map((n, i) => ({ value: String(i), label: n }));
const SCALE_ITEMS = [{ value: 'none', label: 'No key' }, ...Object.entries(SCALES).map(([value, s]) => ({ value, label: capitalized(s.label) }))];
const sameKey = (a, b) => (a && b ? a.root === b.root && a.scale === b.scale : a === b);

function PalettePart({ title, intro, children }) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
        <p className="mt-0.5 text-[12.5px] text-muted">{intro}</p>
      </div>
      {children}
    </section>
  );
}

function KeyPart() {
  const current = useStore((s) => s.ws.key);
  const [root, setRoot] = useState(current?.root ?? 0);
  const [scale, setScale] = useState(current?.scale ?? 'none');
  const [retune, setRetune] = useState(true);
  const draft = scale === 'none' ? null : { root, scale };
  const wider = draft && widerKey(draft);
  return (
    <PalettePart
      title="Key"
      intro={draft ? `Notes in ${describeKey(draft)} sound right together${wider ? `, and so do the other notes of ${describeKey(wider)}` : ''}. The Checks tab flags the rest.` : 'With no key, the notes in the set are not checked.'}
    >
      <div className="flex gap-2">
        {draft && <Select label="Key note" className="w-[84px]" value={String(root)} groups={[{ items: ROOT_ITEMS }]} onChange={(v) => setRoot(Number(v))} />}
        <Select label="Scale" className="flex-1" value={scale} groups={[{ items: SCALE_ITEMS }]} onChange={setScale} />
      </div>
      {draft && (
        <SwitchRow
          label="Move the notes into the new key"
          checked={retune}
          onChange={setRetune}
          hint="Each note keeps its place in the scale, so a tune keeps its shape, and a clash on purpose stays a clash. Noise and recordings with no clear pitch stay as they are. Turn it off to change only what Checks compares against."
        />
      )}
      <Button variant="primary" size="sm" className="self-end" disabled={sameKey(draft, current)} onClick={() => changeKey(draft, { retune })}>
        {!draft && current ? 'Remove the key' : current ? 'Change key' : 'Use this key'}
      </Button>
    </PalettePart>
  );
}

function LoudnessPart() {
  const ws = useStore((s) => s.ws);
  const [levels, setLevels] = useState(ws.loudness);
  return (
    <PalettePart title="Loudness" intro="Sounds that play often sit lowest and alerts highest. Each sound takes the level of the interactions it plays for.">
      {Object.keys(TIER_LABEL).map((tier) => (
        <div key={tier}>
          <Scrub label={TIER_LABEL[tier]} value={levels[tier]} min={LOUDNESS_RANGE[0]} max={LOUDNESS_RANGE[1]} step={0.5} digits={1} unit="dBFS" onChange={(v) => setLevels({ ...levels, [tier]: v })} />
          <p className="truncate px-2.5 pt-1 text-[11.5px] text-muted">
            {ws.sounds
              .filter((p) => tierOf(ws, p.id) === tier)
              .map((p) => p.name)
              .join(', ') || 'No sound plays for these yet.'}
          </p>
        </div>
      ))}
      <Button size="sm" className="self-end" onClick={() => setLoudness(levels)}>
        Set loudness by role
      </Button>
    </PalettePart>
  );
}

function RoomPart() {
  const ws = useStore((s) => s.ws);
  const [from, setFrom] = useState(ws.current);
  const src = ws.sounds.find((p) => p.id === from) || ws.sounds[0];
  const M = src.master;
  return (
    <PalettePart title="Room" intro="One shared space makes the sounds feel like a family. Each sound keeps its own amount of it.">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[12.5px] text-muted">Room from</span>
        <Select label="Sound to take the room from" className="min-w-0 flex-1" value={src.id} groups={[{ items: ws.sounds.map((p) => ({ value: p.id, label: p.name })) }]} onChange={setFrom} />
      </div>
      <p className="px-0.5 text-[12px] text-muted">
        {`${capitalized(M.reverbType)}, ${M.reverbSize.toFixed(2)} s long, darkness ${M.reverbDamping.toFixed(2)}${M.reverbReverse ? ', reversed' : ''}.`}
      </p>
      <Button size="sm" className="self-end" onClick={() => shareRoom(src.id)}>
        Use this room for every sound
      </Button>
    </PalettePart>
  );
}

export function PaletteDialog() {
  const [open, onOpenChange] = useDialog('palette');
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Set palette"
      description="What the sounds in this set share. Each change rewrites every sound at once, and one undo takes it back."
      width={520}
      footer={<Button onClick={closeDialog}>Done</Button>}
    >
      <div className="flex flex-col gap-6">
        <KeyPart />
        <LoudnessPart />
        <RoomPart />
      </div>
    </Dialog>
  );
}

// ---------- shortcuts ----------
const SHORTCUTS = [
  ['Space', 'Play the current sound'],
  ['B', 'Play the comparison'],
  ['L', 'Loop on or off'],
  ['P', 'Preview on or off'],
  ['⌘Z / ⇧⌘Z', 'Undo / redo'],
  ['⌘C / ⌘V', 'Copy / paste a layer, also into another sound'],
  ['⌘D', 'Duplicate the selected layer'],
  ['Delete', 'Delete the selected layer'],
  ['M / S', 'Mute / solo the selected layer'],
  ['= / - / 0', 'Zoom in / out / fit'],
  ['⌘ + scroll', 'Zoom the timeline where you point'],
  ['Esc', 'Select Output'],
  ['Drag a slider', 'Change a value. Click the number, or press Enter on the slider, to type it.'],
  ['Drop a file', 'Add audio as a layer, or open a project'],
];

export function ShortcutsDialog() {
  const [open, onOpenChange] = useDialog('shortcuts');
  const singleKeys = useStore((s) => s.singleKeys);
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
      <div className="mt-4 border-t border-line pt-3">
        <SwitchRow
          label="Single-key shortcuts"
          checked={singleKeys}
          onChange={(v) => setPref({ singleKeys: v })}
          hint="Shortcuts that are one key, like M to mute. They pause while a slider or menu has focus. Turn them off if you use voice control or press them by accident."
        />
      </div>
      <p className="mt-3 px-2.5 text-[12px] text-muted">
        Earcue is free and open source.{' '}
        <a className="underline underline-offset-2 hover:text-ink" href={REPO_URL} target="_blank" rel="noreferrer">
          Source code
        </a>
        {' · '}
        <a className="underline underline-offset-2 hover:text-ink" href="/third-party-licenses.md" target="_blank" rel="noreferrer">
          Open-source licenses
        </a>
      </p>
    </Dialog>
  );
}
