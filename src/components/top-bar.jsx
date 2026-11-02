import { AppWindow, Download, Keyboard, Monitor, Moon, Palette, Play, Redo2, Repeat, Sun, Undo2 } from 'lucide-react';
import { APP_NAME } from '../brand.js';
import { MAX_NAME } from '../engine/model.js';
import { describeKey } from '../engine/palette.js';
import { playCompare, playCurrent, setLoop } from '../playback.js';
import { pickReferenceFile } from '../io.js';
import { currentSound, edit, editSound, goHome, openDialog, redo, removeRef, setCompare, setPref, setPreview, undo, useStore } from '../store.js';
import { Button, IconButton, NameInput, Select, Tip } from './ui.jsx';
import { LogoMark } from './icons.jsx';

const THEMES = ['system', 'light', 'dark'];
const THEME_ICON = { system: Monitor, light: Sun, dark: Moon };
const THEME_LABEL = { system: 'Theme: match system', light: 'Theme: light', dark: 'Theme: dark' };

export function ThemeButton() {
  const theme = useStore((s) => s.theme);
  const ThemeIcon = THEME_ICON[theme] || Monitor;
  return (
    <IconButton label={THEME_LABEL[theme]} onClick={() => setPref({ theme: THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length] })}>
      <ThemeIcon />
    </IconButton>
  );
}

function CompareControl() {
  const ws = useStore((s) => s.ws);
  const refs = useStore((s) => s.refs);
  const compare = useStore((s) => s.compare);
  const others = ws.sounds.filter((s) => s.id !== ws.current);
  const value =
    compare?.kind === 'sound' && others.some((s) => s.id === compare.id)
      ? `sound:${compare.id}`
      : compare?.kind === 'ref' && refs.some((r) => r.id === compare.id)
        ? `ref:${compare.id}`
        : 'none';
  const currentRef = compare?.kind === 'ref' ? refs.find((r) => r.id === compare.id) : null;
  // The file actions come first, so they stay in view however many sounds the list holds.
  const groups = [
    {
      items: [
        { value: 'none', label: 'Nothing' },
        { value: 'add-file', label: 'Compare with an audio file...' },
        ...(currentRef ? [{ value: 'remove-ref', label: `Remove ${currentRef.name} from this list` }] : []),
      ],
    },
    ...(refs.length ? [{ label: 'Audio files', items: refs.map((r) => ({ value: `ref:${r.id}`, label: r.name })) }] : []),
    { label: 'Your sounds', items: others.map((s) => ({ value: `sound:${s.id}`, label: s.name })) },
  ];
  return (
    <div className="flex items-center gap-1 rounded-xl bg-field/60 p-1">
      <span className="pl-1.5 text-[12px] text-muted">Compare</span>
      <Select
        label="Compare with"
        size="sm"
        className="w-[150px] bg-panel hover:bg-panel-2"
        value={value}
        groups={groups}
        onChange={(v) => {
          if (v === 'add-file') pickReferenceFile();
          else if (v === 'remove-ref') removeRef(currentRef.id);
          else if (v === 'none') setCompare(null);
          else {
            const [kind, id] = v.split(':');
            setCompare({ kind, id });
          }
        }}
      />
      <IconButton label="Play the comparison" shortcut="B" size="iconSm" disabled={value === 'none'} onClick={playCompare}>
        <Play className="!size-3.5" />
      </IconButton>
    </div>
  );
}

export function TopBar() {
  const name = useStore((s) => currentSound(s).name);
  const setName = useStore((s) => s.ws.name);
  const setKey = useStore((s) => s.ws.key);
  const loop = useStore((s) => s.loop);
  const canUndo = useStore((s) => s.canUndo);
  const canRedo = useStore((s) => s.canRedo);
  const preview = useStore((s) => s.preview);

  return (
    <header className="flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-panel px-3 py-2 [grid-area:bar]">
      <div className="flex min-w-0 items-center gap-1">
        <Tip label="All sound sets">
          <a
            href="/"
            draggable={false}
            className="flex shrink-0 items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-field"
            onClick={(e) => {
              // A plain click stays in the app; a modified click opens the home page in a new tab as usual.
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              goHome();
            }}
          >
            <LogoMark className="size-6 shrink-0 text-ink" />
            <span className="text-[14px] font-semibold tracking-tight">{APP_NAME}</span>
          </a>
        </Tip>
        <span className="text-faint" aria-hidden="true">
          /
        </span>
        <NameInput label="Set name" value={setName} max={MAX_NAME} fallback="Untitled set" className="min-w-16 max-w-[220px] text-[13px] field-sizing-content" onChange={(v) => edit((ws) => void (ws.name = v), false)} />
        <Tip label="Set palette: key, loudness and room">
          <Button variant="ghost" size="sm" className="px-2" onClick={() => openDialog('palette')}>
            <Palette className="!size-3.5" />
            {/* Phones keep just the icon, so the names beside it still fit. */}
            <span className="max-md:sr-only">{setKey ? describeKey(setKey) : 'No key'}</span>
          </Button>
        </Tip>
        <span className="text-faint" aria-hidden="true">
          /
        </span>
        <NameInput label="Sound name" value={name} max={MAX_NAME} fallback="Untitled" className="min-w-16 max-w-[220px] text-[13px] font-medium field-sizing-content" onChange={(v) => editSound((d) => void (d.name = v), false)} />
      </div>

      <div className="mx-auto flex flex-wrap items-center gap-2">
        <Tip label="Play" shortcut="Space">
          <Button variant="primary" className="px-4" onClick={playCurrent}>
            <Play className="!size-3.5 fill-current" />
            Play
          </Button>
        </Tip>
        <IconButton
          label={loop ? 'Stop looping' : 'Loop: play again and again while you edit'}
          shortcut="L"
          aria-pressed={loop}
          className={loop ? '!bg-accent-soft !text-accent' : ''}
          onClick={() => setLoop(!loop)}
        >
          <Repeat />
        </IconButton>
        <CompareControl />
      </div>

      <div className="flex items-center gap-1">
        <IconButton label="Undo" shortcut="⌘Z" disabled={!canUndo} onClick={undo}>
          <Undo2 />
        </IconButton>
        <IconButton label="Redo" shortcut="⇧⌘Z" disabled={!canRedo} onClick={redo}>
          <Redo2 />
        </IconButton>
        <ThemeButton />
        <IconButton label="Keyboard shortcuts" shortcut="?" onClick={() => openDialog('shortcuts')}>
          <Keyboard />
        </IconButton>
        <Tip label="Try your sounds on real UI" shortcut="P">
          <Button
            variant="secondary"
            className={`ml-1 ${preview !== 'off' ? '!bg-accent-soft !text-accent' : ''}`}
            aria-pressed={preview !== 'off'}
            onClick={() => setPreview(preview === 'off' ? 'split' : 'off')}
          >
            <AppWindow />
            Preview
          </Button>
        </Tip>
        <Button variant="dark" className="ml-1" onClick={() => openDialog('export')}>
          <Download />
          Export
        </Button>
      </div>
    </header>
  );
}
