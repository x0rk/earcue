import { Download, Keyboard, Monitor, Moon, Play, Redo2, Repeat, Sun, Undo2 } from 'lucide-react';
import { APP_NAME } from '../brand.js';
import { playCompare, playCurrent, setLoop } from '../playback.js';
import { pickReferenceFile } from '../io.js';
import { currentSound, editSound, commit, openDialog, redo, setCompare, setPref, undo, useStore } from '../store.js';
import { Button, IconButton, Select, Tip } from './ui.jsx';
import { LogoMark } from './icons.jsx';

const THEMES = ['system', 'light', 'dark'];
const THEME_ICON = { system: Monitor, light: Sun, dark: Moon };
const THEME_LABEL = { system: 'Theme: match system', light: 'Theme: light', dark: 'Theme: dark' };

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
  const groups = [
    { items: [{ value: 'none', label: 'Nothing' }] },
    { label: 'Your sounds', items: others.map((s) => ({ value: `sound:${s.id}`, label: s.name })) },
    ...(refs.length ? [{ label: 'Audio files', items: refs.map((r) => ({ value: `ref:${r.id}`, label: r.name })) }] : []),
    { items: [{ value: 'add-file', label: 'Compare with an audio file...' }] },
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
  const loop = useStore((s) => s.loop);
  const canUndo = useStore((s) => s.canUndo);
  const canRedo = useStore((s) => s.canRedo);
  const theme = useStore((s) => s.theme);
  const ThemeIcon = THEME_ICON[theme] || Monitor;

  return (
    <header className="flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-panel px-3 py-2 [grid-area:bar]">
      <div className="flex min-w-0 items-center gap-2">
        <LogoMark className="size-6 shrink-0 text-ink" />
        <span className="text-[14px] font-semibold tracking-tight">{APP_NAME}</span>
        <span className="text-faint">/</span>
        <input
          aria-label="Sound name"
          value={name}
          onChange={(e) => editSound((d) => void (d.name = e.target.value.slice(0, 60) || 'Untitled'), false)}
          onBlur={() => commit()}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="w-[180px] min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[13px] font-medium hover:border-line focus:border-accent focus:outline-none"
        />
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
        <IconButton label={THEME_LABEL[theme]} onClick={() => setPref({ theme: THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length] })}>
          <ThemeIcon />
        </IconButton>
        <IconButton label="Keyboard shortcuts" shortcut="?" onClick={() => openDialog('shortcuts')}>
          <Keyboard />
        </IconButton>
        <Button variant="dark" className="ml-1" onClick={() => openDialog('export')}>
          <Download />
          Export
        </Button>
      </div>
    </header>
  );
}
