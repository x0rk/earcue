import { useEffect, useState } from 'react';
import { RadioGroup } from 'radix-ui';
import { Copy, ExternalLink, FileText, FolderOpen, MoreHorizontal, Pencil, Play, Plus, Trash2, Upload } from 'lucide-react';
import { APP_NAME } from '../brand.js';
import { MAX_NAME, uniqueName } from '../engine/model.js';
import { loadSamples } from '../engine/samples.js';
import { ROLE_IDS, roleLabel } from '../engine/roles.js';
import { pickSetFiles } from '../io.js';
import { loadKits, openKit, playKitSound } from '../kits.js';
import { previewPatch } from '../playback.js';
import { closeDialog, createSet, deleteSet, duplicateSet, openDialog, openSet, readSet, refreshSets, renameSet, useStore } from '../store.js';
import { Button, ContextMenu, Dialog, EditableText, Menu, Select } from './ui.jsx';
import { LogoMark } from './icons.jsx';
import { ThemeButton } from './top-bar.jsx';

const MAX_CHIPS = 8;
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function editedLabel(updated) {
  const ago = Date.now() - updated;
  if (ago < MINUTE) return 'Edited just now';
  if (ago < HOUR) return `Edited ${Math.floor(ago / MINUTE)} min ago`;
  if (ago < DAY) return `Edited ${Math.floor(ago / HOUR)} h ago`;
  return `Edited ${new Date(updated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

// Plays one sound straight from the saved set, loading any recordings it uses first.
async function playFromSet(setId, soundId) {
  const patch = readSet(setId)?.sounds.find((x) => x.id === soundId);
  if (!patch) return;
  await loadSamples(patch.layers.filter((L) => L.type === 'sample' && L.sampleId).map((L) => L.sampleId));
  previewPatch(patch);
}

function SetCard({ set }) {
  const [renaming, setRenaming] = useState(false);
  const extra = set.sounds.length - MAX_CHIPS;
  const items = [
    { label: 'Open', icon: <FolderOpen />, onSelect: () => openSet(set.id) },
    // The field mounts after the menu has closed, or the menu's focus trap would pull focus back.
    { label: 'Rename', icon: <Pencil />, keepFocus: true, onSelect: () => requestAnimationFrame(() => setRenaming(true)) },
    { label: 'Duplicate', icon: <Copy />, onSelect: () => duplicateSet(set.id) },
    'sep',
    { label: 'Delete', icon: <Trash2 />, danger: true, onSelect: () => openDialog('delete-set', set.id) },
  ];
  return (
    <ContextMenu items={items} disabled={renaming}>
      <div className="group relative flex h-full min-h-[164px] flex-col gap-3 rounded-2xl border border-line bg-panel p-4 transition-colors hover:border-line-strong data-[state=open]:border-line-strong">
        {/* The whole card opens the set. The name field, the menu and the sound buttons sit above it. */}
        <button type="button" className="absolute inset-0 rounded-2xl" aria-label={`Open ${set.name}`} onClick={() => openSet(set.id)} />
        <div className="pointer-events-none flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {renaming ? (
              <EditableText
                startEditing
                label="Set name"
                value={set.name}
                className="pointer-events-auto relative z-10 -ml-1.5 h-7 w-full text-[15px] font-semibold"
                onCommit={(v) => renameSet(set.id, v)}
                onDone={() => setRenaming(false)}
              />
            ) : (
              <h2 className="truncate text-[15px] font-semibold tracking-tight">{set.name}</h2>
            )}
            <p className="mt-0.5 text-[12px] text-muted">
              {set.sounds.length} sound{set.sounds.length === 1 ? '' : 's'} · {editedLabel(set.updated)}
            </p>
          </div>
          <div className="pointer-events-auto relative z-10 -mr-1.5 -mt-1">
            <Menu
              trigger={
                <Button variant="ghost" size="iconSm" aria-label={`More actions for ${set.name}`}>
                  <MoreHorizontal />
                </Button>
              }
              items={items.slice(1)}
            />
          </div>
        </div>
        <ul className="pointer-events-none mt-auto flex flex-wrap gap-1.5" aria-label={`Sounds in ${set.name}`}>
          {set.sounds.slice(0, MAX_CHIPS).map((sound) => (
            <li key={sound.id}>
              <button
                type="button"
                className="pointer-events-auto relative z-10 inline-flex h-7 max-w-[160px] items-center gap-1.5 rounded-full bg-field px-2.5 text-[12px] text-ink hover:bg-field-hover"
                aria-label={`Play ${sound.name}`}
                onClick={() => playFromSet(set.id, sound.id)}
              >
                <Play className="size-2.5 shrink-0 fill-current text-muted" />
                <span className="truncate">{sound.name}</span>
              </button>
            </li>
          ))}
          {extra > 0 && <li className="flex h-7 items-center px-1 text-[12px] text-muted">+{extra} more</li>}
        </ul>
      </div>
    </ContextMenu>
  );
}

const STARTS = [
  {
    value: 'starter',
    title: 'Every interaction',
    body: 'A sound for each of the 28 interactions most product sound kits cover, with several takes of tap and typing. All in one key.',
  },
  {
    value: 'basics',
    title: 'The basics',
    body: 'Tap, toggle on and off, send, receive, success, error and notification.',
  },
  { value: 'blank', title: 'One blank sound', body: 'A single tone to build your own set from.' },
];

// A kit card's chips play one sound for each interaction the kit covers, in the preview's order, so
// kits compare at a glance.
function kitChips(kit) {
  const byRole = ROLE_IDS.map((id) => kit.sounds.find((s) => s.role === id)).filter(Boolean);
  const rest = kit.sounds.filter((s) => !s.role);
  return [...byRole.map((s) => ({ sound: s, label: roleLabel(s.role) })), ...rest.map((s) => ({ sound: s, label: s.name }))].slice(0, MAX_CHIPS);
}

function KitCard({ kits }) {
  const [id, setId] = useState(kits[0].id);
  const [loading, setLoading] = useState(null);
  const kit = kits.find((k) => k.id === id) || kits[0];
  const open = async () => {
    setLoading({ done: 0, total: kit.sounds.length });
    try {
      await openKit(kit, (done, total) => setLoading({ done, total }));
    } finally {
      setLoading(null);
    }
  };
  const chips = kitChips(kit);
  const extra = kit.sounds.length - chips.length;
  const visit = (url) => window.open(url, '_blank', 'noopener,noreferrer');
  const items = [
    { label: 'Open as a set', icon: <FolderOpen />, disabled: !!loading, onSelect: open },
    ...(chips[0] ? [{ label: `Play ${chips[0].label}`, icon: <Play />, onSelect: () => playKitSound(kit, chips[0].sound) }] : []),
    'sep',
    { label: `Read the ${kit.license} licence`, icon: <FileText />, disabled: !kit.licenseUrl, onSelect: () => visit(kit.licenseUrl) },
    { label: 'Visit the source', description: kit.by, icon: <ExternalLink />, disabled: !kit.source, onSelect: () => visit(kit.source) },
  ];
  return (
    <ContextMenu items={items}>
      <div className="flex h-full min-h-[164px] flex-col gap-3 rounded-2xl border border-line bg-panel p-4 data-[state=open]:border-line-strong">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-semibold tracking-tight">{kits.length > 1 ? kit.name.replace(` ${kit.pack}`, '') : kit.name}</h3>
            <p className="mt-0.5 text-[12px] text-muted">
              {kit.by} ·{' '}
              <a href={kit.licenseUrl} target="_blank" rel="noreferrer" className="underline decoration-line-strong underline-offset-2 hover:text-ink">
                {kit.license}
              </a>
            </p>
          </div>
          {kits.length > 1 && (
            <Select label={`${kit.name.replace(` ${kit.pack}`, '')} pack`} size="sm" className="w-[118px]" value={kit.id} onChange={setId} groups={[{ items: kits.map((k) => ({ value: k.id, label: k.pack })) }]} />
          )}
        </div>
        <p className="text-[12.5px] leading-snug text-muted">{kit.about}</p>
        <ul className="mt-auto flex flex-wrap gap-1.5" aria-label={`Sounds in ${kit.name}`}>
          {chips.map(({ sound, label }) => (
            <li key={sound.file}>
              <button
                type="button"
                className="inline-flex h-7 max-w-[160px] items-center gap-1.5 rounded-full bg-field px-2.5 text-[12px] text-ink hover:bg-field-hover"
                aria-label={`Play ${label} from ${kit.name}`}
                title={sound.name}
                onClick={() => playKitSound(kit, sound)}
              >
                <Play className="size-2.5 shrink-0 fill-current text-muted" />
                <span className="truncate">{label}</span>
              </button>
            </li>
          ))}
          {extra > 0 && <li className="flex h-7 items-center px-1 text-[12px] text-muted">+{extra} more</li>}
        </ul>
        <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
          <span className="text-[12px] text-muted">{kit.sounds.length} sounds</span>
          <Button variant="secondary" size="sm" disabled={!!loading} onClick={open} aria-label={`Open ${kit.name} as a set`}>
            <FolderOpen />
            {loading ? `Loading ${loading.done} of ${loading.total}` : 'Open as a set'}
          </Button>
        </div>
      </div>
    </ContextMenu>
  );
}

// Kits that share a pack name are one source in several styles, so they share a card.
function groupKits(kits) {
  const groups = new Map();
  for (const kit of kits) {
    const key = kit.pack ? kit.name.replace(` ${kit.pack}`, '') : kit.id;
    groups.set(key, [...(groups.get(key) || []), kit]);
  }
  return [...groups.values()];
}

function KitsSection() {
  const [kits, setKits] = useState([]);
  useEffect(() => {
    let live = true;
    loadKits().then((list) => live && setKits(list));
    return () => {
      live = false;
    };
  }, []);
  if (!kits.length) return null;
  return (
    <section className="mt-12" aria-labelledby="kits-title">
      <h2 id="kits-title" className="text-[17px] font-semibold tracking-tight">
        Kits to explore
      </h2>
      <p className="mt-1 max-w-[640px] text-[13.5px] text-muted">
        Openly licensed UI sounds from design systems and sound packs. Play them here, or open one as a set to change and export. A set made from a kit keeps its credit, and exports carry it.
      </p>
      <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Kits">
        {groupKits(kits).map((group) => (
          <li key={group[0].id}>
            <KitCard kits={group} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function NewSetDialog() {
  const open = useStore((s) => s.dialog === 'new-set');
  const [name, setName] = useState('');
  const [start, setStart] = useState('starter');
  // The name is suggested once per opening, so a change from another tab never clears what you typed.
  useEffect(() => {
    if (!open) return;
    setName(uniqueName('Untitled set', useStore.getState().sets.map((x) => x.name)));
    setStart('starter');
  }, [open]);
  const create = () => {
    closeDialog();
    createSet(name, start);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !v && closeDialog()}
      title="New sound set"
      description="A set holds the sounds for one product, made to sound like a family."
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={closeDialog}>
            Cancel
          </Button>
          <Button variant="dark" disabled={!name.trim()} onClick={create}>
            Create set
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="flex items-center gap-2 text-[12.5px] text-muted">
          <span className="w-[68px] shrink-0">Name</span>
          <input
            value={name}
            maxLength={MAX_NAME}
            spellCheck={false}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && create()}
            className="min-w-0 flex-1 rounded-[7px] bg-field px-2.5 py-1.5 text-[13px] text-ink outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <RadioGroup.Root className="flex flex-col gap-2" aria-label="Start with" value={start} onValueChange={setStart}>
          {STARTS.map((o) => {
            const active = start === o.value;
            return (
              <RadioGroup.Item
                key={o.value}
                value={o.value}
                // In a radio group the focused option is the chosen one, however focus got there.
                onFocus={() => setStart(o.value)}
                className={`rounded-xl border p-3 text-left transition-colors ${active ? 'border-accent bg-accent-soft/50' : 'border-line hover:border-line-strong hover:bg-panel-2'}`}
              >
                <span className="block text-[13px] font-semibold">{o.title}</span>
                <span className="block text-[12px] text-muted">{o.body}</span>
              </RadioGroup.Item>
            );
          })}
        </RadioGroup.Root>
      </div>
    </Dialog>
  );
}

function DeleteSetDialog() {
  const open = useStore((s) => s.dialog === 'delete-set');
  const id = useStore((s) => s.dialogArg);
  const target = useStore((s) => s.sets.find((x) => x.id === s.dialogArg));
  // Keeps the text while the dialog animates out after the set is gone.
  const [shown, setShown] = useState(null);
  useEffect(() => {
    if (target) setShown(target);
  }, [target]);
  const n = shown?.sounds.length ?? 0;
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !v && closeDialog()}
      title={`Delete ${shown?.name ?? 'this set'}?`}
      description={`Its ${n} sound${n === 1 ? '' : 's'} will be removed from this browser, and this can't be undone. To keep a copy, open the set and export it first.`}
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={closeDialog}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              closeDialog();
              deleteSet(id);
            }}
          >
            Delete set
          </Button>
        </>
      }
    />
  );
}

export function Home() {
  const sets = useStore((s) => s.sets);

  // Another tab can add or change sets; the list follows.
  useEffect(() => {
    const onStorage = () => refreshSets();
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const pageItems = [
    { label: 'New set', icon: <Plus />, onSelect: () => openDialog('new-set') },
    { label: 'Import a set', description: "An exported set's .zip or project files", icon: <Upload />, onSelect: pickSetFiles },
  ];

  return (
    <>
      <ContextMenu items={pageItems}>
        <div className="min-h-full bg-bg">
          <header className="sticky top-0 z-20 flex min-h-[52px] items-center gap-2 border-b border-line bg-panel px-4">
            <LogoMark className="size-6 shrink-0 text-ink" />
            <span className="text-[14px] font-semibold tracking-tight">{APP_NAME}</span>
            <div className="ml-auto flex items-center gap-1">
              <ThemeButton />
              <Button variant="ghost" className="ml-1" onClick={pickSetFiles} title="Make a set from an exported set's .zip or from project files">
                <Upload />
                Import
              </Button>
              <Button variant="dark" className="ml-1" onClick={() => openDialog('new-set')}>
                <Plus />
                New set
              </Button>
            </div>
          </header>
          <main className="mx-auto w-full max-w-[1120px] px-4 pb-16 pt-8 sm:px-6">
            <h1 className="text-[22px] font-semibold tracking-tight">Sound sets</h1>
            <p className="mt-1 max-w-[640px] text-[13.5px] text-muted">
              A set is the sound system for one product: a sound for each interaction, made to fit together. Open a set to change its sounds. Click a sound's name to hear it.
            </p>
            <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Your sound sets">
              <li>
                <button
                  type="button"
                  onClick={() => openDialog('new-set')}
                  className="flex h-full min-h-[164px] w-full flex-col items-start justify-between rounded-2xl border border-dashed border-line-strong p-4 text-left transition-colors hover:border-accent hover:bg-accent-soft/40"
                >
                  <span className="grid size-8 place-items-center rounded-lg bg-field text-muted">
                    <Plus className="size-4" />
                  </span>
                  <span>
                    <span className="block text-[15px] font-semibold tracking-tight">New set</span>
                    <span className="block text-[12px] text-muted">Start with the sounds most products need, or with one blank sound.</span>
                  </span>
                </button>
              </li>
              {sets.map((set) => (
                <li key={set.id}>
                  <SetCard set={set} />
                </li>
              ))}
            </ul>
            <KitsSection />
          </main>
        </div>
      </ContextMenu>
      <NewSetDialog />
      <DeleteSetDialog />
    </>
  );
}
