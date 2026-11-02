import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, Music2, Play, X } from 'lucide-react';
import { MAX_VARIANTS, ROLE_GROUPS, ROLES, roleLabel, soundsForRole } from '../engine/roles.js';
import { onRolePlayed, playRole, playScene, warmRoles } from '../playback.js';
import { setPreview, setPreviewWidth, setRole, useStore } from '../store.js';
import { Button, IconButton, PickMany, Segmented } from './ui.jsx';
import { KitShowcase } from './kit.jsx';

// The preview sits beside the editor only when both fit; below this width it opens full screen.
export const SPLIT_MIN_WINDOW = 1200;
const MIN_WIDTH = 340;
const EDITOR_MIN = 920;
const KEY_STEP = 16;
const PILL_MS = 1400;
const WARM_DELAY_MS = 300;

export const maxPreviewWidth = (windowWidth) => Math.max(MIN_WIDTH, windowWidth - EDITOR_MIN);
export const clampPreviewWidth = (w, windowWidth) => Math.min(maxPreviewWidth(windowWidth), Math.max(MIN_WIDTH, w));

function useWindowWidth() {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

// What the preview shows as: null when it is closed, 'split' beside the editor, or 'full'.
export function usePreviewMode() {
  const pref = useStore((s) => s.preview);
  const wide = useWindowWidth() >= SPLIT_MIN_WINDOW;
  if (pref === 'off') return null;
  return pref === 'split' && wide ? 'split' : 'full';
}

export function usePreviewWidth() {
  const width = useStore((s) => s.previewWidth);
  return clampPreviewWidth(width, useWindowWidth());
}

function Splitter({ width }) {
  const drag = useRef(null);
  const max = maxPreviewWidth(window.innerWidth);
  const set = (w, persist) => {
    const next = clampPreviewWidth(w, window.innerWidth);
    if (persist) setPreviewWidth(next);
    else useStore.setState({ previewWidth: next });
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Preview width"
      aria-valuenow={width}
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={max}
      tabIndex={0}
      className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize touch-none outline-none hover:bg-accent/30 focus-visible:bg-accent/40"
      onPointerDown={(e) => {
        drag.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => drag.current && set(window.innerWidth - e.clientX, false)}
      onPointerUp={(e) => {
        if (!drag.current) return;
        drag.current = false;
        set(window.innerWidth - e.clientX, true);
      }}
      onKeyDown={(e) => {
        // The pane hangs off the right edge, so the left arrow widens it.
        if (e.key === 'ArrowLeft') set(width + KEY_STEP, true);
        else if (e.key === 'ArrowRight') set(width - KEY_STEP, true);
        else return;
        e.preventDefault();
      }}
    />
  );
}

const summaryOf = (sounds) => (!sounds.length ? 'Silent' : sounds.length === 1 ? sounds[0].name : `${sounds[0].name} +${sounds.length - 1}`);

function RoleRow({ role, ws }) {
  const sounds = soundsForRole(ws, role.id);
  const ids = sounds.map((s) => s.id);
  const toggle = (id, on) => {
    const next = on ? [...ids, id] : ids.filter((x) => x !== id);
    setRole(role.id, next.length ? next : null);
  };
  return (
    <li className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-field">
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-medium text-ink">
          {role.label}
          {role.loop && <span className="ml-1.5 rounded bg-field px-1 py-px text-[10.5px] font-normal text-muted">Loops</span>}
        </p>
        <p className="text-[11.5px] leading-snug text-muted">{role.hint}</p>
      </div>
      <PickMany
        label={`Sounds for ${role.label}`}
        summary={summaryOf(sounds)}
        className="w-[132px]"
        selected={ids}
        items={ws.sounds.map((s) => ({ value: s.id, label: s.name, disabled: !ids.includes(s.id) && ids.length >= MAX_VARIANTS }))}
        onToggle={toggle}
        actions={[{ label: 'Silent', onSelect: () => setRole(role.id, null) }]}
      />
      <IconButton label={`Play the ${role.label} sound`} size="iconSm" disabled={!sounds.length} onClick={() => playRole(role.id)}>
        <Play className="!size-3.5" />
      </IconButton>
    </li>
  );
}

function RoleMap() {
  const ws = useStore((s) => s.ws);
  return (
    <div className="flex flex-col gap-1 p-2">
      <p className="px-1.5 pb-1 pt-1 text-[12px] text-muted">
        Pick the sounds each interaction plays. With more than one, it plays one of them at random, never the same twice in a row. Until you pick, it uses the sound with the same name and its numbered takes, like Tap 2.
      </p>
      {ROLE_GROUPS.map((g) => (
        <section key={g.id} aria-label={g.label}>
          <h3 className="px-1.5 pb-0.5 pt-2.5 text-[11px] font-medium text-muted">{g.label}</h3>
          <ul className="flex flex-col gap-0.5">
            {ROLES.filter((r) => r.group === g.id).map((r) => (
              <RoleRow key={r.id} role={r} ws={ws} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// Names the sound that just played, so you learn which sound belongs to which interaction.
function PlayedPill() {
  const [played, setPlayed] = useState(null);
  useEffect(() => {
    let timer = 0;
    const off = onRolePlayed(({ roleId, sound }) => {
      clearTimeout(timer);
      setPlayed({ roleId, name: sound?.name, key: Math.random() });
      timer = setTimeout(() => setPlayed(null), PILL_MS);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, []);
  if (!played) return null;
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-20 flex max-w-[calc(100%-2rem)] items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-[12px] text-panel shadow-pop animate-pop-in" aria-hidden="true" key={played.key}>
      <Music2 className="size-3.5 shrink-0" />
      <span className="truncate">
        {roleLabel(played.roleId)}: {played.name || 'silent'}
      </span>
    </div>
  );
}

export function PreviewPane({ mode, width }) {
  // Below the split width there is no beside-the-editor view to go back to, so leaving means closing.
  const canSplit = useWindowWidth() >= SPLIT_MIN_WINDOW;
  const [view, setView] = useState('try');
  // The kit's dialogs, menus and toasts stay inside this frame, the way they would inside an app.
  const [frame, setFrame] = useState(null);

  // Renders every mapped sound ahead of time, and again shortly after a sound changes.
  useEffect(() => {
    warmRoles();
    let timer = 0;
    const off = useStore.subscribe((s, prev) => {
      if (s.ws === prev.ws) return;
      clearTimeout(timer);
      timer = setTimeout(warmRoles, WARM_DELAY_MS);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, []);

  const full = mode === 'full';
  const kit = (
    <div ref={setFrame} className="relative h-full min-h-0">
      <div className="h-full overflow-y-auto">
        <KitShowcase container={frame} />
      </div>
      {/* Full screen, the label sits over the kit rather than the sound list beside it. */}
      {full && <PlayedPill />}
    </div>
  );
  return (
    <section
      data-preview
      aria-label="Preview"
      className={full ? 'fixed inset-0 z-30 flex flex-col bg-panel' : 'relative flex min-h-0 min-w-0 flex-col border-l border-line bg-panel [grid-area:preview]'}
      onKeyDown={(e) => {
        // Esc leaves full screen, unless a dialog or menu inside the preview used it first.
        if (full && e.key === 'Escape' && !e.defaultPrevented) setPreview(canSplit ? 'split' : 'off');
      }}
    >
      {!full && <Splitter width={width} />}
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-1.5">
        <h2 className="text-[13px] font-semibold tracking-tight">Preview</h2>
        {!full && (
          <div className="w-[176px]">
            <Segmented
              label="Show"
              hideLabel
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: 'try', label: 'Try it' },
                { value: 'map', label: 'Sounds' },
              ]}
            />
          </div>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={playScene} title="Play tap, send, receive and success in a row">
            <Play className="!size-3.5" />
            Scene
          </Button>
          {canSplit && (
            <IconButton label={full ? 'Exit full screen' : 'Full screen'} onClick={() => setPreview(full ? 'split' : 'full')}>
              {full ? <Minimize2 /> : <Maximize2 />}
            </IconButton>
          )}
          <IconButton label="Close preview" shortcut="P" onClick={() => setPreview('off')}>
            <X />
          </IconButton>
        </div>
      </header>
      <div className="relative min-h-0 flex-1">
        {full ? (
          <div className="grid h-full grid-cols-[minmax(280px,320px)_minmax(0,1fr)]">
            <aside className="min-h-0 overflow-y-auto border-r border-line" aria-label="Sounds for each interaction">
              <RoleMap />
            </aside>
            {kit}
          </div>
        ) : view === 'map' ? (
          <div className="h-full overflow-y-auto">
            <RoleMap />
          </div>
        ) : (
          kit
        )}
        {!full && <PlayedPill />}
      </div>
    </section>
  );
}
