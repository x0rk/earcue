import { useEffect, useState } from 'react';
import { Tooltip } from 'radix-ui';
import { Lightbulb, Upload } from 'lucide-react';
import { handleDroppedFiles, loadStoredSamples } from './io.js';
import { playCompare, playCurrent, setLoop, startRenderLoop } from './playback.js';
import {
  copyLayer,
  deleteLayer,
  duplicateLayer,
  duplicateSound,
  editLayer,
  flushSave,
  followUrl,
  openDialog,
  pasteLayer,
  redo,
  select,
  selectedLayer,
  setPref,
  setPreview,
  setTitle,
  showToast,
  undo,
  useStore,
} from './store.js';
import { Home } from './components/home.jsx';
import { Button } from './components/ui.jsx';
import { PreviewPane, SPLIT_MIN_WINDOW, usePreviewMode, usePreviewWidth } from './components/preview.jsx';
import { TopBar } from './components/top-bar.jsx';
import { Sidebar, focusSelectedRow } from './components/sidebar.jsx';
import { Timeline, TimelineBar, fitTimeline, zoomBy } from './components/timeline.jsx';
import { Inspector } from './components/inspector.jsx';
import { Dock, MetricsBar } from './components/dock.jsx';
import { ExportDialog, NewSoundDialog, PaletteDialog, RecordDialog, ShortcutsDialog } from './components/dialogs.jsx';

function useTheme() {
  const theme = useStore((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);
}

// Keys a native app owns. Cmd+A selects text only in a field or the code view, never the whole
// interface, and Cmd+S saves instead of opening the browser's "Save page" dialog.
function useAppKeys() {
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key === 'a' && !isTyping(e.target)) {
        e.preventDefault();
        const region = e.target.closest?.('[data-selectable]');
        if (region) window.getSelection()?.selectAllChildren(region);
      } else if (key === 's') {
        e.preventDefault();
        flushSave();
        showToast('Saved. Earcue saves as you go, too.');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function isTyping(el) {
  const tag = el?.tagName;
  return (tag === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(el.type)) || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable;
}

// Single-key shortcuts stay out of the way of controls that use keys themselves, like sliders and
// menus, and they can be turned off in the shortcuts dialog (WCAG 2.1.4).
const KEY_WIDGETS = '[role="slider"],[role="radio"],[role="menu"],[role="menuitem"],[role="listbox"],[role="option"],[role="switch"],[role="tab"],[role="combobox"]';
const ownsKeys = (el) => !!el?.closest?.(KEY_WIDGETS);

function useShortcuts() {
  useEffect(() => {
    const onKey = (e) => {
      // Radix marks keys it used, like the Escape that closed a dialog or menu, as handled.
      if (e.defaultPrevented) return;
      const s = useStore.getState();
      if (s.dialog) return;
      const typing = isTyping(e.target);
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      // Keys pressed in the preview belong to its UI kit, and while it covers the editor, so do the rest.
      const previewFull = s.preview === 'full' || (s.preview === 'split' && window.innerWidth < SPLIT_MIN_WINDOW);
      if (e.target.closest?.('[data-preview]') || previewFull) {
        if (key === 'p' && !typing && !mod && !e.altKey && s.singleKeys && !ownsKeys(e.target)) setPreview('off');
        return;
      }
      if (mod && key === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && key === 'y' && !typing) {
        e.preventDefault();
        redo();
        return;
      }
      if (typing) return;
      const L = selectedLayer(s);
      if (mod && key === 'd') {
        e.preventDefault();
        if (L) {
          duplicateLayer(L.id);
          focusSelectedRow();
        } else duplicateSound(s.ws.current);
        return;
      }
      if (mod && key === 'c') {
        if (L && !window.getSelection()?.toString()) copyLayer(L.id);
        return;
      }
      if (mod && key === 'v') {
        if (s.clipboard) {
          e.preventDefault();
          pasteLayer();
        }
        return;
      }
      if (mod || e.altKey) return;
      if (e.key === ' ') {
        // Space plays from anywhere it has no job of its own. Buttons, switches and the like keep it.
        const role = e.target.getAttribute?.('role');
        if (e.target.tagName === 'BUTTON' || (role && role !== 'slider')) return;
        e.preventDefault();
        playCurrent();
        return;
      }
      if (!s.singleKeys || ownsKeys(e.target)) return;
      if (key === 'b') playCompare();
      else if (key === 'l') setLoop(!s.loop);
      else if (key === 'm' && L) editLayer(L.id, (d) => void (d.on = !d.on));
      else if (key === 's' && L) editLayer(L.id, (d) => void (d.solo = !d.solo));
      else if ((e.key === 'Backspace' || e.key === 'Delete') && L) {
        e.preventDefault();
        deleteLayer(L.id);
        focusSelectedRow();
      } else if (e.key === 'Escape') select({ kind: 'output' });
      else if (e.key === '=' || e.key === '+') zoomBy(1.5);
      else if (e.key === '-') zoomBy(1 / 1.5);
      else if (e.key === '0') fitTimeline();
      else if (e.key === '?') openDialog('shortcuts');
      else if (key === 'p') setPreview(s.preview === 'off' ? 'split' : 'off');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function useFileDrop() {
  const [over, setOver] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
    const enter = (e) => {
      if (!hasFiles(e)) return;
      depth += 1;
      setOver(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setOver(false);
    };
    const overFn = (e) => hasFiles(e) && e.preventDefault();
    const drop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      handleDroppedFiles([...e.dataTransfer.files]);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', overFn);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', overFn);
      window.removeEventListener('drop', drop);
    };
  }, []);
  return over;
}

// The status region stays mounted, because screen readers only announce text that changes inside one.
function Toast() {
  const toast = useStore((s) => s.toast);
  return (
    // Above dialogs too, so an action taken in one still reports back.
    <div role="status" className="pointer-events-none fixed bottom-[calc(20px+env(safe-area-inset-bottom,0px))] left-1/2 z-[60] max-w-[calc(100vw-32px)] -translate-x-1/2">
      {toast && (
        <div key={toast.id} className="rounded-xl bg-ink px-4 py-2.5 text-[13px] text-panel shadow-pop animate-pop-in">
          {toast.text}
        </div>
      )}
    </div>
  );
}

// The URL says which set is open, so Back and Forward move between sets and the home page.
function useNavigation() {
  const title = useStore(setTitle);
  useEffect(() => {
    document.title = title;
  }, [title]);
  useEffect(() => {
    window.addEventListener('popstate', followUrl);
    window.addEventListener('pagehide', flushSave);
    return () => {
      window.removeEventListener('popstate', followUrl);
      window.removeEventListener('pagehide', flushSave);
    };
  }, []);
}

export function App() {
  useTheme();
  useNavigation();
  useAppKeys();
  const page = useStore((s) => s.page);
  const setId = useStore((s) => s.ws?.id);

  useEffect(() => {
    loadStoredSamples();
  }, []);

  return (
    <Tooltip.Provider delayDuration={400} skipDelayDuration={150}>
      {page === 'set' ? <Editor key={setId} /> : <Home />}
      <Toast />
    </Tooltip.Provider>
  );
}

// One tip, shown once: the study found people learn by changing a real sound, not from a tour.
function FirstTip() {
  const done = useStore((s) => s.tipDone);
  if (done) return null;
  return (
    <div className="flex shrink-0 items-center gap-2.5 border-b border-line bg-accent-soft/60 px-3 py-2 text-[12.5px] text-ink">
      <Lightbulb className="size-4 shrink-0 text-accent" />
      <p className="min-w-0 flex-1">
        Make a sound yours: pick a layer on the left and drag any slider on the right. Then open <span className="font-medium">Preview</span> to hear the whole set on real UI.
      </p>
      <Button variant="secondary" size="sm" onClick={() => setPref({ tipDone: true })}>
        Got it
      </Button>
    </div>
  );
}

function Editor() {
  useShortcuts();
  const dragging = useFileDrop();
  const previewMode = usePreviewMode();
  const previewWidth = usePreviewWidth();

  useEffect(() => startRenderLoop(), []);

  return (
    <>
      {/* Full screen, the preview covers the editor, so the editor leaves the tab order until it closes. */}
      <div
        className="app-grid bg-panel"
        data-preview={previewMode === 'split' ? 'split' : undefined}
        style={{ '--preview-w': `${previewWidth}px` }}
        inert={previewMode === 'full' ? true : undefined}
      >
        <TopBar />
        <Sidebar />
        <main className="app-center flex min-h-0 min-w-0 flex-col bg-canvas [grid-area:center]">
          <FirstTip />
          <TimelineBar />
          <Timeline />
          <MetricsBar />
          <Dock />
        </main>
        <Inspector />
        {previewMode === 'split' && <PreviewPane mode="split" width={previewWidth} />}
      </div>
      {previewMode === 'full' && <PreviewPane mode="full" width={previewWidth} />}
      {dragging && (
        <div className="pointer-events-none fixed inset-3 z-50 grid place-items-center rounded-2xl border-2 border-dashed border-accent bg-accent-soft/80">
          <div className="flex flex-col items-center gap-2 text-accent">
            <Upload className="size-6" />
            <p className="text-[14px] font-semibold">Drop audio to add it as a layer</p>
            <p className="text-[12.5px]">or drop an exported project (.json) to open it</p>
          </div>
        </div>
      )}
      <NewSoundDialog />
      <ExportDialog />
      <RecordDialog />
      <ShortcutsDialog />
      <PaletteDialog />
    </>
  );
}
