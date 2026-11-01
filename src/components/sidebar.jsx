import { useState } from 'react';
import { Copy, FileAudio, FolderOpen, GitCompareArrows, Headphones, Mic, MoreHorizontal, Pencil, Plus, RotateCcw, SlidersHorizontal, Trash2, Volume2, VolumeX } from 'lucide-react';
import { TYPE_BLURB, TYPE_LABEL } from '../engine/model.js';
import { addLayer, currentSound, deleteSound, duplicateSound, editLayer, openDialog, renameSound, restoreTemplates, select, selectSound, setCompare, useStore } from '../store.js';
import { pickAudioFiles, pickProjectFile } from '../io.js';
import { Button, EditableText, Menu } from './ui.jsx';
import { LayerIcon } from './icons.jsx';

// After a layer is duplicated or deleted, the control that did it may be gone, so focus moves to
// the selected row instead of falling back to the page.
export function focusSelectedRow() {
  requestAnimationFrame(() => {
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const sel = useStore.getState().sel;
    document.querySelector(`[data-layer-row="${sel?.kind === 'layer' ? sel.id : 'output'}"]`)?.focus();
  });
}

// A mouse click shouldn't leave focus on the row, or Space would press the row again instead of playing.
// Screen readers' simulated clicks have no pointer type, so they keep focus where it is.
const releaseMouseFocus = (e) => e.detail > 0 && e.nativeEvent.pointerType !== '' && e.currentTarget.blur();

function PaneHead({ title, children }) {
  return (
    <div className="flex h-10 shrink-0 items-center justify-between pl-3.5 pr-1.5">
      <h2 className="text-[12px] font-semibold text-ink">{title}</h2>
      {children}
    </div>
  );
}

function SoundRow({ sound, active, isCompare, canDelete }) {
  const [renaming, setRenaming] = useState(false);
  return (
    <div className={`group flex h-8 items-center rounded-lg pr-1 ${active ? 'bg-accent-soft' : 'hover:bg-field'}`}>
      {renaming ? (
        <EditableText
          startEditing
          label="Sound name"
          value={sound.name}
          className="mx-1 h-7 min-w-0 flex-1 text-[13px]"
          onCommit={(v) => renameSound(sound.id, v)}
          onDone={() => setRenaming(false)}
        />
      ) : (
        <button
          type="button"
          aria-current={active ? 'true' : undefined}
          className={`flex h-full min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 text-left text-[13px] ${active ? 'font-medium text-ink' : 'text-ink/85'}`}
          onClick={(e) => {
            selectSound(sound.id);
            releaseMouseFocus(e);
          }}
          onDoubleClick={() => setRenaming(true)}
          title={sound.description || 'Double-click to rename'}
        >
          <span className="truncate">{sound.name}</span>
          {isCompare && <span className="rounded border border-b/60 px-1 font-mono text-[10px] font-semibold text-b">B</span>}
        </button>
      )}
      <Menu
        trigger={
          <Button variant="ghost" size="iconSm" aria-label={`More actions for ${sound.name}`} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100">
            <MoreHorizontal />
          </Button>
        }
        items={[
          // The field mounts after the menu has closed, or the menu's focus trap would pull focus back.
          { label: 'Rename', icon: <Pencil />, keepFocus: true, onSelect: () => requestAnimationFrame(() => setRenaming(true)) },
          { label: 'Duplicate', icon: <Copy />, onSelect: () => duplicateSound(sound.id) },
          { label: 'Compare with this', icon: <GitCompareArrows />, disabled: active, onSelect: () => setCompare({ kind: 'sound', id: sound.id }) },
          'sep',
          { label: 'Delete', icon: <Trash2 />, danger: true, disabled: !canDelete, onSelect: () => deleteSound(sound.id) },
        ]}
      />
    </div>
  );
}

function LayerRow({ L, selected, dimmed }) {
  return (
    <div className={`group flex h-8 items-center gap-0.5 rounded-lg pr-1 ${selected ? 'bg-accent-soft' : 'hover:bg-field'}`}>
      <button
        type="button"
        data-layer-row={L.id}
        aria-current={selected ? 'true' : undefined}
        className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-lg pl-6 pr-2 text-left text-[13px]"
        onClick={(e) => {
          select({ kind: 'layer', id: L.id });
          releaseMouseFocus(e);
        }}
      >
        <span className="grid size-[18px] shrink-0 place-items-center rounded-[5px] text-panel" style={{ background: `var(--c-${L.type})`, opacity: dimmed ? 0.45 : 1 }}>
          <LayerIcon type={L.type} className="size-3" />
        </span>
        <span className={`truncate ${dimmed ? 'text-muted' : 'text-ink'}`}>{L.name}</span>
      </button>
      <Button
        variant="ghost"
        size="iconSm"
        aria-label={`Solo ${L.name}`}
        aria-pressed={L.solo}
        title="Solo: hear only this layer (S)"
        className={L.solo ? '!text-hot opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}
        onClick={() => editLayer(L.id, (d) => void (d.solo = !d.solo))}
      >
        <Headphones />
      </Button>
      <Button
        variant="ghost"
        size="iconSm"
        aria-label={L.on ? `Mute ${L.name}` : `Unmute ${L.name}`}
        aria-pressed={!L.on}
        title={L.on ? 'Mute (M)' : 'Unmute (M)'}
        className={!L.on ? 'opacity-100' : selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}
        onClick={() => editLayer(L.id, (d) => void (d.on = !d.on))}
      >
        {L.on ? <Volume2 /> : <VolumeX />}
      </Button>
    </div>
  );
}

export function Sidebar() {
  const ws = useStore((s) => s.ws);
  const sel = useStore((s) => s.sel);
  const compare = useStore((s) => s.compare);
  const P = currentSound({ ws });
  const anySolo = P.layers.some((l) => l.on && l.solo);

  const addItems = [
    ...['tone', 'noise', 'modal'].map((type) => ({
      label: TYPE_LABEL[type],
      description: TYPE_BLURB[type],
      icon: (
        <span className="grid size-6 place-items-center rounded-md text-panel" style={{ background: `var(--c-${type})` }}>
          <LayerIcon type={type} className="!size-3.5" />
        </span>
      ),
      onSelect: () => addLayer(type),
    })),
    'sep',
    { label: 'Audio file', description: 'Use a recording or any sound file', icon: <FileAudio />, onSelect: pickAudioFiles },
    { label: 'Record with microphone', description: 'Tap a desk, a cup, a key', icon: <Mic />, onSelect: () => openDialog('record') },
  ];

  return (
    <aside className="flex min-h-0 flex-col border-r border-line bg-panel [grid-area:left]" aria-label="Sounds and layers">
      <section className="flex max-h-[46%] min-h-0 flex-col border-b border-line">
        <PaneHead title="Sound set">
          <Button variant="ghost" size="sm" onClick={() => openDialog('new')}>
            <Plus className="!size-3.5" />
            New
          </Button>
        </PaneHead>
        <div className="min-h-0 overflow-y-auto px-1.5 pb-2">
          {ws.sounds.map((s) => (
            <SoundRow key={s.id} sound={s} active={s.id === ws.current} isCompare={compare?.kind === 'sound' && compare.id === s.id && s.id !== ws.current} canDelete={ws.sounds.length > 1} />
          ))}
        </div>
      </section>
      <section className="flex min-h-0 flex-1 flex-col">
        <PaneHead title="Layers">
          <Menu
            trigger={
              <Button variant="ghost" size="sm" aria-label="Add a layer">
                <Plus className="!size-3.5" />
                Add
              </Button>
            }
            items={addItems}
          />
        </PaneHead>
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          <div className={`flex h-8 items-center rounded-lg ${sel?.kind === 'output' ? 'bg-accent-soft' : 'hover:bg-field'}`}>
            <button
              type="button"
              data-layer-row="output"
              aria-current={sel?.kind === 'output' ? 'true' : undefined}
              className="flex h-full flex-1 items-center gap-2 rounded-lg px-2.5 text-left text-[13px] font-medium"
              onClick={(e) => {
                select({ kind: 'output' });
                releaseMouseFocus(e);
              }}
              title="Settings for the whole sound"
            >
              <span className="grid size-[18px] place-items-center rounded-[5px] bg-ink text-panel">
                <SlidersHorizontal className="size-3" />
              </span>
              Output
            </button>
          </div>
          {P.layers.map((L) => (
            <LayerRow key={L.id} L={L} selected={sel?.kind === 'layer' && sel.id === L.id} dimmed={!L.on || (anySolo && !L.solo)} />
          ))}
          {!P.layers.length && <p className="px-3 py-2 text-[12px] text-muted">This sound has no layers. Use Add to start, or drop an audio file anywhere.</p>}
        </div>
      </section>
      <div className="flex flex-wrap gap-1 border-t border-line p-1.5">
        <Button variant="ghost" size="sm" onClick={pickProjectFile} title="Open a .json project file you exported earlier">
          <FolderOpen className="!size-3.5" />
          Open project
        </Button>
        <Button variant="ghost" size="sm" onClick={restoreTemplates} title="Add back any templates you deleted">
          <RotateCcw className="!size-3.5" />
          Restore templates
        </Button>
      </div>
    </aside>
  );
}
