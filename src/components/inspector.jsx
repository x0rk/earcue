import { createElement } from 'react';
import { ArrowDown, ArrowUp, Copy, Dices, Download, Info, Trash2 } from 'lucide-react';
import { TYPE_LABEL, randSeed } from '../engine/model.js';
import { samples, sampleDurationMs } from '../engine/samples.js';
import { fmtHz, fmtHzUnit, fmtPan, fmtSigned, hzToNote } from '../lib/format.js';
import {
  commit,
  currentSound,
  deleteLayer,
  duplicateLayer,
  editLayer,
  editMaster,
  editSound,
  moveLayer,
  openDialog,
  selectedLayer,
  useStore,
} from '../store.js';
import { Button, IconButton, Scrub, Section, Segmented, SwitchRow } from './ui.jsx';
import { LayerIcon, WaveIcon } from './icons.jsx';

// Field helpers bind a scrub field to a layer or the output without repeating the plumbing.
function field(key, value, set, props) {
  // createElement takes the key in its config; JSX with a spread would trip React's key-spread warning here.
  return createElement(Scrub, { key, value, onChange: (v) => set(v), onCommit: commit, ...props });
}
const layerField = (L, key, props) => field(key, L[key], (v) => editLayer(L.id, (d) => void (d[key] = v), false), props);
const filterField = (L, key, props) => field(`filter-${key}`, L.filter[key], (v) => editLayer(L.id, (d) => void (d.filter[key] = v), false), props);
const lfoField = (L, key, props) => field(`lfo-${key}`, L.lfo[key], (v) => editLayer(L.id, (d) => void (d.lfo[key] = v), false), props);
const masterField = (M, key, props) => field(key, M[key], (v) => editMaster((d) => void (d[key] = v), false), props);

const ms = { unit: 'ms', step: 0.1, digits: 1 };

function HintBar() {
  const hint = useStore((s) => s.hint);
  return (
    <div className="sticky bottom-0 z-10 mt-auto border-t border-line bg-panel-2 px-3 py-2.5" aria-live="polite">
      {hint ? (
        <p className="text-[12px] leading-snug text-muted">
          <span className="font-semibold text-ink">{hint.label}. </span>
          {hint.text}
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-[12px] text-faint">
          <Info className="size-3.5" />
          Point at any control to see what it does.
        </p>
      )}
    </div>
  );
}

function Header({ children }) {
  return <div className="sticky top-0 z-10 flex min-h-12 items-center gap-2 border-b border-line bg-panel px-3">{children}</div>;
}

function NameInput({ value, onChange, label }) {
  return (
    <input
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value, false)}
      onBlur={() => commit()}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[14px] font-semibold tracking-tight hover:border-line focus:border-accent focus:outline-none"
    />
  );
}

function LayerInspector({ L }) {
  const P = currentSound();
  const index = P.layers.findIndex((l) => l.id === L.id);
  const sample = L.type === 'sample' ? samples.get(L.sampleId) : null;
  const totalMs = sample ? sampleDurationMs(sample) : 0;

  return (
    <>
      <Header>
        <span className="grid size-6 shrink-0 place-items-center rounded-md text-panel" style={{ background: `var(--c-${L.type})` }}>
          <LayerIcon type={L.type} className="size-3.5" />
        </span>
        <NameInput label="Layer name" value={L.name} onChange={(v) => editLayer(L.id, (d) => void (d.name = v.slice(0, 40) || TYPE_LABEL[L.type]), false)} />
        <IconButton label="Move up" size="iconSm" disabled={index <= 0} onClick={() => moveLayer(L.id, -1)}>
          <ArrowUp />
        </IconButton>
        <IconButton label="Move down" size="iconSm" disabled={index >= P.layers.length - 1} onClick={() => moveLayer(L.id, 1)}>
          <ArrowDown />
        </IconButton>
        <IconButton label="Duplicate layer" shortcut="⌘D" size="iconSm" onClick={() => duplicateLayer(L.id)}>
          <Copy />
        </IconButton>
        <IconButton label="Delete layer" shortcut="⌫" size="iconSm" onClick={() => deleteLayer(L.id)}>
          <Trash2 />
        </IconButton>
      </Header>

      {L.type === 'sample' ? (
        <Section
          id="clip"
          title="Audio clip"
          more={[
            layerField(L, 'fadeIn', { label: 'Fade in', min: 0, max: 200, ...ms, hint: 'Softens the very start of the clip so it does not click.' }),
            layerField(L, 'fadeOut', { label: 'Fade out', min: 0, max: 500, ...ms, hint: 'Softens the end of the clip.' }),
            <SwitchRow key="rev" label="Play backwards" checked={L.reverse} onChange={(v) => editLayer(L.id, (d) => void (d.reverse = v))} hint="Reverses the audio. Trims apply to the reversed clip." />,
          ]}
        >
          <p className="px-0.5 text-[12px] text-muted">
            {sample
              ? `${L.sampleName || sample.name} · ${Math.round(totalMs)} ms · ${sample.channels.length === 2 ? 'stereo' : 'mono'}`
              : 'The audio for this layer is not in this browser. Add the file again.'}
          </p>
          {layerField(L, 'start', { label: 'Starts at', min: 0, max: 1000, ...ms, hint: 'When this layer begins, counted from the start of the sound.' })}
          {layerField(L, 'trimStart', { label: 'Trim start', min: 0, max: Math.max(1, totalMs), ...ms, hint: 'Cuts time off the beginning of the audio. New audio is trimmed to where the sound begins.' })}
          {layerField(L, 'trimEnd', { label: 'Trim end', min: 0, max: Math.max(1, totalMs), ...ms, hint: 'Cuts time off the end of the audio.' })}
          {layerField(L, 'pitch', {
            label: 'Pitch',
            min: -24,
            max: 24,
            step: 0.01,
            digits: 2,
            unit: 'st',
            bipolar: true,
            format: (v) => fmtSigned(v, 2),
            hint: 'Plays the audio higher or lower, in semitones. Like a tape, higher also makes it shorter.',
          })}
        </Section>
      ) : (
        <Section
          id="shape"
          title="Shape"
          more={L.type === 'modal' ? null : [layerField(L, 'hold', { label: 'Hold', min: 0, max: 500, ...ms, hint: 'How long it stays at full volume before it starts to fade.' })]}
        >
          {layerField(L, 'start', { label: 'Starts at', min: 0, max: 1000, ...ms, hint: 'When this layer begins, counted from the start of the sound.' })}
          {layerField(L, 'attack', {
            label: 'Fade in',
            min: 0.1,
            max: 300,
            log: true,
            ...ms,
            hint: 'How fast the layer reaches full volume. Short sounds snappy and clicky; long swells in softly. Audio people call this attack.',
          })}
          {layerField(L, 'decay', {
            label: 'Fade out',
            min: 2,
            max: 3000,
            log: true,
            ...ms,
            hint: 'How long the layer takes to die away. Short feels tight and dry; long rings on. Audio people call this decay.',
          })}
        </Section>
      )}

      {L.type === 'tone' && (
        <>
          <Section
            id="tone"
            title="Tone"
            more={[
              layerField(L, 'voices', { label: 'Thickness', min: 1, max: 5, step: 1, unit: 'voices', hint: 'Stacks slightly detuned copies of the tone for a fuller sound. Called unison.' }),
              layerField(L, 'detune', { label: 'Spread', min: 0, max: 50, step: 0.5, digits: 1, unit: 'cents', hint: 'How far apart the stacked copies are tuned. Only matters with more than one voice.' }),
            ]}
          >
            <Segmented
              label="Character"
              size="tall"
              value={L.wave}
              hint="The basic color of the tone. Pure is clean like a sine wave; Soft is rounder; Hollow is retro; Buzzy has the most edge."
              onChange={(v) => editLayer(L.id, (d) => void (d.wave = v))}
              options={[
                { value: 'sine', label: 'Pure', icon: <WaveIcon wave="sine" /> },
                { value: 'triangle', label: 'Soft', icon: <WaveIcon wave="triangle" /> },
                { value: 'square', label: 'Hollow', icon: <WaveIcon wave="square" /> },
                { value: 'sawtooth', label: 'Buzzy', icon: <WaveIcon wave="sawtooth" /> },
              ]}
            />
            {layerField(L, 'pitchStart', {
              label: 'Pitch',
              min: 20,
              max: 12000,
              log: true,
              step: 0.1,
              digits: 0,
              unit: 'Hz',
              sub: hzToNote,
              hint: 'How high or low the tone is. The musical note is shown next to the number.',
            })}
            {layerField(L, 'pitchEnd', {
              label: 'Slides to',
              min: 20,
              max: 12000,
              log: true,
              step: 0.1,
              digits: 0,
              unit: 'Hz',
              sub: hzToNote,
              hint: 'The pitch it slides to. Sliding down feels like a drop or a thud; sliding up feels like a pop or a lift.',
            })}
            {layerField(L, 'glide', { label: 'Slide time', min: 0, max: 400, step: 0.5, digits: 1, unit: 'ms', hint: 'How long the slide takes. At 0 there is no slide and the tone stays at Pitch.' })}
          </Section>
          <Section
            id="bell"
            title="Bell"
            more={[layerField(L, 'fmDecay', { label: 'Bell fade', min: 2, max: 2000, log: true, ...ms, hint: 'How quickly the bell overtones fade, separate from the tone itself.' })]}
          >
            {layerField(L, 'fmIndex', {
              label: 'Amount',
              min: 0,
              max: 8,
              step: 0.01,
              digits: 2,
              format: (v) => (v > 0 ? v.toFixed(2) : 'Off'),
              hint: 'Adds metallic, bell-like overtones on top of the tone. 0 turns it off. Technically this is FM synthesis.',
            })}
            {layerField(L, 'fmRatio', { label: 'Color', min: 0.25, max: 12, step: 0.01, digits: 2, unit: '×', hint: 'Which overtones you get. Whole numbers sound musical; values in between sound clangy and metallic.' })}
          </Section>
        </>
      )}

      {L.type === 'noise' && (
        <Section id="noise" title="Noise">
          <Segmented
            label="Color"
            value={L.color}
            hint="White is a bright hiss, Pink is softer and smoother, Brown is deep and rumbly."
            onChange={(v) => editLayer(L.id, (d) => void (d.color = v))}
            options={[
              { value: 'white', label: 'White' },
              { value: 'pink', label: 'Pink' },
              { value: 'brown', label: 'Brown' },
            ]}
          />
          <SeedRow L={L} />
        </Section>
      )}

      {L.type === 'modal' && (
        <Section
          id="object"
          title="Object"
          more={[
            layerField(L, 'partials', { label: 'Overtones', min: 1, max: 5, step: 1, hint: 'How many resonances ring out. More sounds richer and more complex.' }),
            <SeedRow key="seed" L={L} />,
          ]}
        >
          <Segmented
            label="Material"
            value={L.material}
            hint="What the struck object sounds like it is made of."
            onChange={(v) => editLayer(L.id, (d) => void (d.material = v))}
            options={[
              { value: 'bar', label: 'Metal' },
              { value: 'glass', label: 'Glass' },
              { value: 'wood', label: 'Wood' },
              { value: 'membrane', label: 'Drum' },
            ]}
          />
          {layerField(L, 'freq', { label: 'Pitch', min: 40, max: 8000, log: true, step: 0.1, digits: 0, unit: 'Hz', sub: hzToNote, hint: 'The main note the object rings at.' })}
          {layerField(L, 'damping', { label: 'Dampen', min: 0, max: 1, step: 0.01, digits: 2, hint: 'How quickly the high resonances die out. Higher sounds duller and more muted, like a hand on the object.' })}
          {layerField(L, 'brightness', { label: 'Brightness', min: 0, max: 1, step: 0.01, digits: 2, hint: 'How loud the higher resonances are compared to the main note.' })}
          {layerField(L, 'strike', {
            label: 'Hit noise',
            min: -60,
            max: 0,
            step: 0.5,
            digits: 1,
            unit: 'dB',
            format: (v) => (v <= -60 ? 'Off' : v.toFixed(1)),
            hint: 'The tiny click of the hit itself. All the way left turns it off.',
          })}
        </Section>
      )}

      <Section
        id="filter"
        title="Filter"
        more={
          L.filter.type === 'none'
            ? null
            : [
                filterField(L, 'envAmt', {
                  label: 'Sweep',
                  min: -6,
                  max: 6,
                  step: 0.05,
                  digits: 2,
                  unit: 'oct',
                  bipolar: true,
                  format: (v) => (v === 0 ? 'Off' : fmtSigned(v, 2)),
                  hint: 'Starts the filter higher (right) or lower (left) and moves it to Frequency. Great for swishes and zaps.',
                }),
                filterField(L, 'envTime', { label: 'Sweep time', min: 1, max: 2000, log: true, ...ms, hint: 'How long the sweep takes.' }),
              ]
        }
      >
        <Segmented
          label="Mode"
          stack
          value={L.filter.type}
          hint="Removes part of the sound. Darker cuts the highs, Thinner cuts the lows, Focus keeps only a narrow band."
          onChange={(v) => editLayer(L.id, (d) => void (d.filter.type = v))}
          options={[
            { value: 'none', label: 'Off' },
            { value: 'lowpass', label: 'Darker', title: 'Low-pass' },
            { value: 'highpass', label: 'Thinner', title: 'High-pass' },
            { value: 'bandpass', label: 'Focus', title: 'Band-pass' },
          ]}
        />
        {L.filter.type !== 'none' && (
          <>
            {filterField(L, 'freq', { label: 'Frequency', min: 20, max: 20000, log: true, step: 1, format: fmtHz, unit: 'Hz', hint: 'Where the filter acts. For Darker, everything above this gets quieter.' })}
            {filterField(L, 'q', { label: 'Resonance', min: 0.1, max: 20, log: true, step: 0.01, digits: 2, hint: 'Boosts the sound right at the frequency. High values ring and whistle.' })}
          </>
        )}
      </Section>

      <Section id="wobble" title="Wobble">
        <Segmented
          label="What wobbles"
          stack
          value={L.lfo.target}
          hint="Makes something move up and down over time: the pitch (vibrato), the filter (wah), or the volume (tremolo)."
          onChange={(v) => editLayer(L.id, (d) => void (d.lfo.target = v))}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'pitch', label: 'Pitch' },
            { value: 'filter', label: 'Filter' },
            { value: 'amp', label: 'Volume' },
          ]}
        />
        {L.lfo.target !== 'off' && (
          <>
            {lfoField(L, 'rate', { label: 'Speed', min: 0.1, max: 80, log: true, step: 0.01, digits: 1, unit: 'Hz', hint: 'How many wobbles per second.' })}
            {lfoField(L, 'depth', {
              label: 'Depth',
              min: 0,
              max: 1,
              step: 0.01,
              digits: 2,
              format: (v) => (L.lfo.target === 'pitch' ? `±${Math.round(v * 100)}c` : L.lfo.target === 'filter' ? `±${(v * 2).toFixed(1)} oct` : `${Math.round(v * 100)}%`),
              hint: 'How strong the wobble is.',
            })}
            {L.lfo.target === 'filter' && L.filter.type === 'none' && <p className="px-0.5 text-[12px] text-hot">Turn the filter on to hear this.</p>}
          </>
        )}
      </Section>

      <Section
        id="mix"
        title="Mix"
        more={[
          layerField(L, 'drive', { label: 'Grit', min: 0, max: 1, step: 0.01, digits: 2, hint: 'Adds distortion. A little makes it warmer and more present; a lot makes it crunchy.' }),
          layerField(L, 'reverbSend', { label: 'Room', min: 0, max: 1, step: 0.01, digits: 2, hint: 'How much of this layer goes into the room effect. Set the room on Output.' }),
          layerField(L, 'delaySend', { label: 'Echo', min: 0, max: 1, step: 0.01, digits: 2, hint: 'How much of this layer goes into the echo effect. Set the echo on Output.' }),
        ]}
      >
        {layerField(L, 'level', { label: 'Volume', min: -48, max: 6, step: 0.1, digits: 1, unit: 'dB', format: (v) => fmtSigned(v, 1), hint: 'How loud this layer is compared to the others. You can also drag its first dot up and down.' })}
        {layerField(L, 'pan', { label: 'Left / right', min: -1, max: 1, step: 0.01, bipolar: true, format: fmtPan, hint: 'Places the layer left or right in stereo. Most UI sounds stay centered.' })}
      </Section>
    </>
  );
}

function SeedRow({ L }) {
  return (
    <div className="flex h-8 items-center justify-between rounded-[7px] px-2.5 text-[12.5px] text-muted hover:bg-field">
      <span>Variation</span>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => editLayer(L.id, (d) => void (d.seed = randSeed()))}
        title="Pick a different random pattern"
        onPointerEnter={() => useStore.setState({ hint: { label: 'Variation', text: 'Noise is random. This picks a different random pattern. The difference is subtle but real.' } })}
        onPointerLeave={() => useStore.setState({ hint: null })}
      >
        <Dices className="!size-3.5" />
        Shuffle
      </Button>
    </div>
  );
}

function OutputInspector() {
  const P = currentSound();
  const M = P.master;
  return (
    <>
      <Header>
        <NameInput label="Sound name" value={P.name} onChange={(v) => editSound((d) => void (d.name = v.slice(0, 60) || 'Untitled'), false)} />
        <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">Whole sound</span>
      </Header>
      <Section
        id="out-main"
        title="Output"
        more={[masterField(M, 'fade', { label: 'End fade', min: 0, max: 100, ...ms, hint: 'Fades the very end of the file so it never stops with a click.' })]}
      >
        {masterField(M, 'out', {
          label: 'Loudness',
          min: -40,
          max: -1,
          step: 0.5,
          digits: 1,
          unit: 'dBFS',
          hint: 'How loud the finished sound peaks. UI sounds usually sit between -24 and -18 so they never startle anyone.',
        })}
        {masterField(M, 'variation', {
          label: 'Natural variation',
          min: 0,
          max: 100,
          step: 1,
          unit: 'cents',
          format: (v) => (v > 0 ? `±${v}` : 'Off'),
          hint: 'Nudges the pitch a little on every play so a sound heard many times does not feel robotic. Applied when played, not saved into the WAV.',
        })}
      </Section>
      <Section
        id="out-eq"
        title="Tone"
        more={[
          masterField(M, 'presenceFreq', { label: 'Presence at', min: 600, max: 10000, log: true, format: fmtHz, unit: 'Hz', hint: 'Where the presence boost or cut is centered.' }),
          masterField(M, 'lpf', { label: 'Cut highs', min: 500, max: 20000, log: true, format: (v) => (v >= 19999 ? 'Off' : fmtHzUnit(v)), hint: 'Removes everything above this frequency. Use it to tame harsh fizz. (Low-pass)' }),
          masterField(M, 'air', { label: 'Air', min: -18, max: 12, step: 0.1, digits: 1, unit: 'dB', format: (v) => fmtSigned(v, 1), bipolar: true, hint: 'Boosts or cuts the very top end, above 8 kHz. A little adds sparkle.' }),
        ]}
      >
        {masterField(M, 'hpf', {
          label: 'Cut lows',
          min: 20,
          max: 2000,
          log: true,
          format: (v) => (v <= 20.5 ? 'Off' : fmtHzUnit(v)),
          hint: 'Removes everything below this frequency. Phone and laptop speakers cannot play deep bass anyway, so cutting it keeps sounds light and clean. (High-pass)',
        })}
        {masterField(M, 'low', { label: 'Bass', min: -18, max: 12, step: 0.1, digits: 1, unit: 'dB', bipolar: true, format: (v) => fmtSigned(v, 1), hint: 'Boosts or cuts the low end, below about 250 Hz. Cutting makes a sound lighter.' })}
        {masterField(M, 'presence', { label: 'Presence', min: -18, max: 12, step: 0.1, digits: 1, unit: 'dB', bipolar: true, format: (v) => fmtSigned(v, 1), hint: 'Boosts or cuts the middle-high range where sounds feel close and clear.' })}
      </Section>
      <Section
        id="out-room"
        title="Room"
        more={[
          masterField(M, 'reverbDamping', { label: 'Darkness', min: 0, max: 1, step: 0.01, digits: 2, hint: 'How muffled the room sounds. Higher is softer, like a carpeted room.' }),
          masterField(M, 'reverbPredelay', { label: 'Gap', min: 0, max: 100, step: 0.5, digits: 1, unit: 'ms', hint: 'A short pause before the room kicks in. Keeps the start of the sound crisp. (Pre-delay)' }),
        ]}
      >
        {masterField(M, 'reverbMix', { label: 'Amount', min: 0, max: 1, step: 0.01, digits: 2, format: (v) => (v > 0 ? v.toFixed(2) : 'Off'), hint: 'Adds the sound of a space around it. A little makes a UI sound feel less dry. (Reverb)' })}
        {masterField(M, 'reverbSize', { label: 'Size', min: 0.05, max: 3, log: true, step: 0.01, digits: 2, unit: 's', hint: 'How big the space is. Small rooms suit UI sounds best.' })}
      </Section>
      <Section
        id="out-echo"
        title="Echo"
        more={[masterField(M, 'delayTone', { label: 'Tone', min: 500, max: 20000, log: true, format: fmtHz, unit: 'Hz', hint: 'Darkens each repeat. Lower values make echoes softer.' })]}
      >
        {masterField(M, 'delayMix', { label: 'Amount', min: 0, max: 1, step: 0.01, digits: 2, format: (v) => (v > 0 ? v.toFixed(2) : 'Off'), hint: 'Adds repeats of the sound. (Delay)' })}
        {masterField(M, 'delayTime', { label: 'Time', min: 5, max: 1000, log: true, step: 0.5, digits: 0, unit: 'ms', hint: 'The gap between repeats.' })}
        {masterField(M, 'delayFeedback', { label: 'Repeats', min: 0, max: 0.9, step: 0.01, digits: 2, hint: 'How many times it repeats. Higher keeps echoing longer.' })}
      </Section>
      <Section
        id="out-punch"
        title="Punch"
        more={
          M.compOn
            ? [
                masterField(M, 'compThreshold', { label: 'Threshold', min: -60, max: 0, step: 0.5, digits: 1, unit: 'dB', hint: 'Above this level the compressor starts turning the sound down.' }),
                masterField(M, 'compRatio', { label: 'Ratio', min: 1, max: 20, step: 0.1, digits: 1, unit: ':1', hint: 'How strongly it turns down loud parts. 2 is gentle, 10 is heavy.' }),
                masterField(M, 'compAttack', { label: 'Attack', min: 0.1, max: 100, log: true, step: 0.1, digits: 1, unit: 'ms', hint: 'How fast it reacts. Slower lets the first hit through for more punch.' }),
                masterField(M, 'compRelease', { label: 'Release', min: 10, max: 1000, log: true, step: 1, unit: 'ms', hint: 'How fast it lets go after the sound gets quieter.' }),
                masterField(M, 'compMakeup', { label: 'Make-up', min: 0, max: 24, step: 0.1, digits: 1, unit: 'dB', hint: 'Adds volume back after compressing.' }),
              ]
            : null
        }
      >
        {masterField(M, 'drive', { label: 'Warmth', min: 0, max: 1, step: 0.01, digits: 2, hint: 'Gentle saturation on the whole sound. Makes it feel fuller and more solid.' })}
        <SwitchRow
          label="Even out loud and quiet parts"
          checked={M.compOn}
          onChange={(v) => editMaster((d) => void (d.compOn = v))}
          hint="Turns on a compressor, which tames the loudest moments so the tail feels fuller. Its settings appear under More options."
        />
      </Section>
      <div className="px-3 py-3">
        <Button variant="dark" size="lg" className="w-full" onClick={() => openDialog('export')}>
          <Download />
          Export sound
        </Button>
      </div>
    </>
  );
}

export function Inspector() {
  useStore((s) => s.ws);
  useStore((s) => s.samplesVersion);
  const L = useStore((s) => selectedLayer(s));
  return (
    <aside className="flex min-h-0 flex-col overflow-y-auto border-l border-line bg-panel [grid-area:right]" aria-label="Properties">
      {L ? <LayerInspector key={L.id} L={L} /> : <OutputInspector />}
      <HintBar />
    </aside>
  );
}
