import { useEffect, useState } from 'react';
import { Tooltip } from 'radix-ui';
import { Upload } from 'lucide-react';
import { handleDroppedFiles, loadStoredSamples } from './io.js';
import { playCompare, playCurrent, setLoop, startRenderLoop } from './playback.js';
import {
  copyLayer,
  deleteLayer,
  duplicateLayer,
  duplicateSound,
  editLayer,
  openDialog,
  pasteLayer,
  redo,
  select,
  selectedLayer,
  undo,
  useStore,
} from './store.js';
import { TopBar } from './components/top-bar.jsx';
import { Sidebar } from './components/sidebar.jsx';
import { Timeline, TimelineBar, fitTimeline, zoomBy } from './components/timeline.jsx';
import { Inspector } from './components/inspector.jsx';
import { Dock, MetricsBar } from './components/dock.jsx';
import { ExportDialog, NewSoundDialog, RecordDialog, ShortcutsDialog } from './components/dialogs.jsx';

function useTheme() {
  const theme = useStore((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);
}

function isTyping(el) {
  const tag = el?.tagName;
  return (tag === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(el.type)) || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable;
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e) => {
      const s = useStore.getState();
      if (s.dialog) return;
      const typing = isTyping(e.target);
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
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
        if (L) duplicateLayer(L.id);
        else duplicateSound(s.ws.current);
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
        if (e.target.tagName === 'BUTTON' || e.target.getAttribute?.('role') === 'slider') return;
        e.preventDefault();
        playCurrent();
      } else if (key === 'b') playCompare();
      else if (key === 'l') setLoop(!s.loop);
      else if (key === 'm' && L) editLayer(L.id, (d) => void (d.on = !d.on));
      else if (key === 's' && L) editLayer(L.id, (d) => void (d.solo = !d.solo));
      else if ((e.key === 'Backspace' || e.key === 'Delete') && L) {
        e.preventDefault();
        deleteLayer(L.id);
      } else if (e.key === 'Escape') select({ kind: 'output' });
      else if (e.key === '=' || e.key === '+') zoomBy(1.5);
      else if (e.key === '-') zoomBy(1 / 1.5);
      else if (e.key === '0') fitTimeline();
      else if (e.key === '?') openDialog('shortcuts');
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

function Toast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div
      key={toast.id}
      role="status"
      className="fixed bottom-[calc(20px+env(safe-area-inset-bottom,0px))] left-1/2 z-50 max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-xl bg-ink px-4 py-2.5 text-[13px] text-panel shadow-pop animate-pop-in"
    >
      {toast.text}
    </div>
  );
}

export function App() {
  useTheme();
  useShortcuts();
  const dragging = useFileDrop();

  useEffect(() => {
    const stop = startRenderLoop();
    loadStoredSamples();
    return stop;
  }, []);

  return (
    <Tooltip.Provider delayDuration={400} skipDelayDuration={150}>
      <div className="app-grid bg-panel">
        <TopBar />
        <Sidebar />
        <main className="app-center flex min-h-0 min-w-0 flex-col bg-canvas [grid-area:center]">
          <TimelineBar />
          <Timeline />
          <MetricsBar />
          <Dock />
        </main>
        <Inspector />
      </div>
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
      <Toast />
    </Tooltip.Provider>
  );
}
