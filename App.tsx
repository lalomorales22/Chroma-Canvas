import React, { Suspense, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  CanvasElement,
  ContextMenuState,
  EditorAction,
  ElementType,
  LibraryItem,
} from './types';
import { SAMPLE_AUDIO, SAMPLE_VIDEOS } from './constants';
import { Timeline } from './components/Canvas/Timeline';
import { RightSidebar } from './components/Sidebar/RightSidebar';
import { GalleryPage } from './components/Gallery/GalleryPage';
import { AppHeader, IconButton } from './components/AppHeader';
import { Icons } from './components/Icon';
import { ToastHost, toast } from './components/ui/Toast';
import { SettingsModal } from './components/modals/SettingsModal';
import { WelcomeModal } from './components/modals/WelcomeModal';
import { ShortcutsModal } from './components/modals/ShortcutsModal';
import { CommandPalette, Command } from './components/modals/CommandPalette';
import { canRedo, canUndo, docOf, historyReducer, initialUndoable } from './state/history';
import { initialState } from './state/reducer';
import { removeBackground } from './services/geminiService';
import {
  clearProject,
  collectGarbage,
  hasSavedProject,
  importBlob,
  loadProject,
  saveProject,
} from './services/storage';
import { blobToDataURL, dataURLToBlob, getMediaDuration } from './utils/media';
import { createElement, createLibraryItem } from './utils/elements';
import { importFiles } from './utils/importFiles';

// Recorder Studio pulls in three.js — load it only when opened.
const RecorderStudio = React.lazy(() =>
  import('./components/RecorderStudio').then((m) => ({ default: m.RecorderStudio })),
);

const App: React.FC = () => {
  const [undoable, dispatch] = useReducer(historyReducer, initialUndoable);
  const state = undoable.present;

  const requestRef = useRef<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    targetId: null,
  });
  const [sidebarWidth, setSidebarWidth] = useState(340);
  const [isProcessingBg, setIsProcessingBg] = useState(false);
  const [boot, setBoot] = useState<'loading' | 'welcome' | 'ready'>('loading');
  const [showSettings, setShowSettings] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [recorderBusy, setRecorderBusy] = useState(false);

  // ------------------------------------------------------------------ boot
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (await hasSavedProject()) {
          const doc = await loadProject();
          if (doc && alive) {
            dispatch({ type: 'LOAD_PROJECT', payload: doc });
            setBoot('ready');
            toast('Project restored from autosave.', 'success');
            void collectGarbage(doc);
            return;
          }
        }
      } catch (e) {
        console.warn('Autosave restore failed:', e);
      }
      if (alive) setBoot('welcome');
    })();
    return () => {
      alive = false;
    };
  }, []);

  // -------------------------------------------------------------- autosave
  useEffect(() => {
    if (boot !== 'ready') return;
    const handle = window.setTimeout(() => {
      void saveProject(docOf(state)).catch((e) => console.warn('Autosave failed:', e));
    }, 1500);
    return () => window.clearTimeout(handle);
  }, [boot, state.elements, state.library, state.duration, state.tracks, state.canvasMode]);

  useEffect(() => {
    const flush = () => {
      if (boot === 'ready') void saveProject(docOf(state));
    };
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, [boot, state]);

  // -------------------------------------------------------- playback clock
  useEffect(() => {
    if (state.isPlaying) {
      const startTime = performance.now();
      const startOffset = state.currentTime;
      const animate = () => {
        const elapsed = (performance.now() - startTime) / 1000;
        const newTime = startOffset + elapsed;
        if (newTime >= state.duration) {
          dispatch({ type: 'SET_PLAYING', payload: false });
          return;
        }
        dispatch({ type: 'SET_TIME', payload: newTime });
        requestRef.current = requestAnimationFrame(animate);
      };
      requestRef.current = requestAnimationFrame(animate);
    } else if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [state.isPlaying, state.seekVersion, state.duration]);

  // ------------------------------------------------------------- shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inField =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;
      const mod = e.metaKey || e.ctrlKey;

      // Palette works everywhere
      if (mod && e.code === 'KeyK') {
        e.preventDefault();
        setShowPalette((v) => !v);
        return;
      }
      if (state.view !== 'EDITOR' || inField) return;

      if (mod && e.code === 'KeyZ') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'REDO' : 'UNDO' });
        return;
      }
      if (mod && e.code === 'KeyY') {
        e.preventDefault();
        dispatch({ type: 'REDO' });
        return;
      }
      if (mod && e.code === 'KeyC') {
        dispatch({ type: 'COPY_SELECTED' });
        return;
      }
      if (mod && e.code === 'KeyX') {
        dispatch({ type: 'CUT_SELECTED' });
        return;
      }
      if (mod && e.code === 'KeyV') {
        dispatch({ type: 'PASTE_CLIPBOARD' });
        return;
      }
      if (mod && e.code === 'KeyD') {
        e.preventDefault();
        dispatch({ type: 'DUPLICATE_SELECTED' });
        return;
      }
      if (mod && e.code === 'KeyA') {
        e.preventDefault();
        dispatch({ type: 'SELECT_ALL' });
        return;
      }
      if (mod) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          dispatch({ type: 'TOGGLE_PLAY' });
          break;
        case 'Backspace':
        case 'Delete':
          if (state.selectedIds.length > 0) dispatch({ type: 'DELETE_SELECTED' });
          break;
        case 'KeyS':
          dispatch({ type: 'SPLIT_CLIP', payload: null });
          break;
        case 'ArrowLeft':
          if (state.selectedIds.length) {
            e.preventDefault();
            dispatch({ type: 'NUDGE_SELECTED', payload: { deltaTime: e.shiftKey ? -1 : -0.1 } });
          }
          break;
        case 'ArrowRight':
          if (state.selectedIds.length) {
            e.preventDefault();
            dispatch({ type: 'NUDGE_SELECTED', payload: { deltaTime: e.shiftKey ? 1 : 0.1 } });
          }
          break;
        case 'Home':
          e.preventDefault();
          dispatch({ type: 'SEEK', payload: 0 });
          break;
        case 'End': {
          e.preventDefault();
          const end = state.elements.reduce((m, el) => Math.max(m, el.startTime + el.duration), 0);
          dispatch({ type: 'SEEK', payload: end });
          break;
        }
        case 'Equal':
        case 'NumpadAdd':
          dispatch({ type: 'SET_ZOOM', payload: state.zoom + 10 });
          break;
        case 'Minus':
        case 'NumpadSubtract':
          dispatch({ type: 'SET_ZOOM', payload: state.zoom - 10 });
          break;
        case 'Slash':
          if (e.shiftKey) {
            e.preventDefault();
            setShowShortcuts(true);
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.selectedIds, state.view, state.zoom, state.elements]);

  // ---------------------------------------------------------- context menu
  const handleContextMenu = (e: React.MouseEvent, id: string | null) => {
    e.preventDefault();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, targetId: id });
  };
  const closeContextMenu = useCallback(
    () => setContextMenu((c) => (c.visible ? { ...c, visible: false } : c)),
    [],
  );

  const handleRemoveBg = async (id: string) => {
    const el = state.elements.find((x) => x.id === id);
    if (!el || !el.src) return;
    setIsProcessingBg(true);
    closeContextMenu();
    try {
      const blob = await fetch(el.src).then((r) => r.blob());
      const base64 = await blobToDataURL(blob);
      const resultDataUrl = await removeBackground(base64, blob.type);
      const newBlob = await dataURLToBlob(resultDataUrl);
      const { mediaId, url } = await importBlob(newBlob);
      dispatch({
        type: 'UPDATE_ELEMENT',
        payload: { id, changes: { src: url, mediaId, name: `${el.name} (No BG)` } },
      });
      toast('Background removed.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Background removal failed.', 'error');
    } finally {
      setIsProcessingBg(false);
    }
  };

  // ------------------------------------------------------------- app drop
  const handleAppDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (state.view !== 'EDITOR') return;
    const maxTrackId = state.elements.length
      ? Math.max(...state.elements.map((el) => el.trackId))
      : -1;
    const targetTrackId = maxTrackId + 1;

    if (e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      try {
        const items = await importFiles(files, 'IMAGE');
        dispatch({ type: 'ADD_LIBRARY_ITEMS', payload: items });
        let insertTime = state.currentTime;
        for (const item of items) {
          const duration = item.duration ?? 5;
          dispatch({
            type: 'ADD_ELEMENT',
            payload: createElement({
              type: item.type,
              src: item.src,
              mediaId: item.mediaId,
              name: item.name,
              startTime: insertTime,
              duration,
              sourceDuration:
                item.type === ElementType.VIDEO || item.type === ElementType.AUDIO
                  ? duration
                  : undefined,
              trackId: targetTrackId,
            }),
          });
          insertTime += duration;
        }
      } catch {
        toast('Import failed for one or more files.', 'error');
      }
      return;
    }

    const type = e.dataTransfer.getData('type') as ElementType;
    const src = e.dataTransfer.getData('src');
    const name = e.dataTransfer.getData('name');
    const mediaId = e.dataTransfer.getData('mediaId') || undefined;
    const durationRaw = e.dataTransfer.getData('duration');
    const duration = durationRaw ? parseFloat(durationRaw) : 5;
    if (type && src) {
      dispatch({
        type: 'ADD_ELEMENT',
        payload: createElement({
          type,
          src,
          mediaId,
          name: name || 'New Clip',
          startTime: state.currentTime,
          duration,
          sourceDuration:
            type === ElementType.VIDEO || type === ElementType.AUDIO ? duration : undefined,
          trackId: targetTrackId,
        }),
      });
    }
  };

  // ---------------------------------------------------------- demo project
  const loadDemo = async () => {
    setBoot('ready');
    toast('Loading demo media…', 'info');
    const items: LibraryItem[] = [];
    for (const sample of [...SAMPLE_VIDEOS, ...SAMPLE_AUDIO]) {
      const type = sample.type === 'AUDIO' ? ElementType.AUDIO : ElementType.VIDEO;
      const duration = await getMediaDuration(sample.src, type);
      items.push(
        createLibraryItem({
          type,
          src: sample.src,
          name: sample.name,
          category: type === ElementType.AUDIO ? 'AUDIO' : 'VIDEO',
          duration,
        }),
      );
    }
    dispatch({ type: 'ADD_LIBRARY_ITEMS', payload: items });
    // Put the first video on the timeline so there's something to play with.
    const first = items[0];
    if (first) {
      dispatch({
        type: 'ADD_ELEMENT',
        payload: createElement({
          type: first.type,
          src: first.src,
          name: first.name,
          startTime: 0,
          duration: Math.min(15, first.duration ?? 15),
          sourceDuration: first.duration,
          trackId: 0,
        }),
      });
    }
    toast('Demo loaded — press Space to play!', 'success');
  };

  const newProject = async () => {
    dispatch({ type: 'LOAD_PROJECT', payload: docOf(initialState) });
    await clearProject().catch(() => {});
    toast('New project started.', 'info');
  };

  // -------------------------------------------------------- recorder save
  const handleRecorderSave = async (items: LibraryItem[]) => {
    dispatch({ type: 'SET_VIEW', payload: 'EDITOR' });
    try {
      // Persist recordings to IndexedDB so they survive a refresh.
      const persisted: LibraryItem[] = [];
      for (const item of items) {
        if (item.src.startsWith('blob:')) {
          const blob = await fetch(item.src).then((r) => r.blob());
          const { mediaId, url } = await importBlob(blob);
          persisted.push({ ...item, src: url, mediaId });
        } else {
          persisted.push(item);
        }
      }
      dispatch({ type: 'ADD_LIBRARY_ITEMS', payload: persisted });
      toast(`${persisted.length} recording${persisted.length === 1 ? '' : 's'} saved to Gallery.`, 'success');
    } catch {
      dispatch({ type: 'ADD_LIBRARY_ITEMS', payload: items });
      toast('Recordings added (could not persist to storage).', 'info');
    }
  };

  // -------------------------------------------------------------- commands
  const paletteCommands: Command[] = [
    { id: 'play', label: state.isPlaying ? 'Pause' : 'Play', hint: 'Space', action: () => dispatch({ type: 'TOGGLE_PLAY' }) },
    { id: 'undo', label: 'Undo', hint: '⌘Z', action: () => dispatch({ type: 'UNDO' }) },
    { id: 'redo', label: 'Redo', hint: '⇧⌘Z', action: () => dispatch({ type: 'REDO' }) },
    { id: 'split', label: 'Split clip at playhead', hint: 'S', action: () => dispatch({ type: 'SPLIT_CLIP', payload: null }) },
    { id: 'duplicate', label: 'Duplicate selected', hint: '⌘D', action: () => dispatch({ type: 'DUPLICATE_SELECTED' }) },
    { id: 'delete', label: 'Delete selected', hint: '⌫', action: () => dispatch({ type: 'DELETE_SELECTED' }) },
    { id: 'select-all', label: 'Select all clips', hint: '⌘A', action: () => dispatch({ type: 'SELECT_ALL' }) },
    {
      id: 'add-text',
      label: 'Add text overlay',
      keywords: 'title caption',
      action: () =>
        dispatch({
          type: 'ADD_ELEMENT',
          payload: createElement({
            type: ElementType.TEXT,
            name: 'Text Overlay',
            text: 'Double Click to Edit',
            startTime: state.currentTime,
            duration: 3,
          }),
        }),
    },
    { id: 'snap', label: `Snapping: ${state.snapping ? 'on → off' : 'off → on'}`, keywords: 'magnet', action: () => dispatch({ type: 'TOGGLE_SNAPPING' }) },
    { id: 'fit', label: 'Fit timeline to view', action: () => dispatch({ type: 'TRIGGER_FIT_VIEW' }) },
    { id: 'autofit', label: `Auto-fit: ${state.isAutoFit ? 'on → off' : 'off → on'}`, action: () => dispatch({ type: 'TOGGLE_AUTO_FIT' }) },
    { id: 'zoom-in', label: 'Zoom in', hint: '+', action: () => dispatch({ type: 'SET_ZOOM', payload: state.zoom + 20 }) },
    { id: 'zoom-out', label: 'Zoom out', hint: '-', action: () => dispatch({ type: 'SET_ZOOM', payload: state.zoom - 20 }) },
    { id: 'landscape', label: 'Canvas: Landscape 16:9', action: () => dispatch({ type: 'SET_CANVAS_MODE', payload: 'landscape' }) },
    { id: 'portrait', label: 'Canvas: Portrait 9:16', action: () => dispatch({ type: 'SET_CANVAS_MODE', payload: 'portrait' }) },
    { id: 'recorder', label: 'Go to Recorder Studio', keywords: 'record webcam screen stream studio', action: () => dispatch({ type: 'SET_VIEW', payload: 'RECORDER' }) },
    { id: 'editor', label: 'Go to Media Editor', keywords: 'edit timeline cut video', action: () => dispatch({ type: 'SET_VIEW', payload: 'EDITOR' }) },
    { id: 'gallery', label: 'Go to Gallery', keywords: 'media files browse library', action: () => dispatch({ type: 'SET_VIEW', payload: 'GALLERY' }) },
    { id: 'settings', label: 'Settings (API key)', keywords: 'gemini key', action: () => setShowSettings(true) },
    { id: 'shortcuts', label: 'Keyboard shortcuts', hint: '?', action: () => setShowShortcuts(true) },
    { id: 'demo', label: 'Load demo project', action: () => void loadDemo() },
    { id: 'new', label: 'New project (clears everything)', keywords: 'clear reset', action: () => void newProject() },
  ];

  const selectedElement = state.elements.find((el) => el.id === contextMenu.targetId);

  return (
    <div
      className="h-screen w-screen bg-black flex items-center justify-center p-4 text-stone-200 overflow-hidden"
      onClick={closeContextMenu}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleAppDrop}
    >
      <ToastHost />
      <div className="w-full h-full max-w-[1920px] bg-black rounded-3xl border border-zinc-800 shadow-2xl overflow-hidden flex flex-col relative">
        {/* Shared header on every page */}
        <AppHeader
          view={state.view}
          onNavigate={(view) => dispatch({ type: 'SET_VIEW', payload: view })}
          busy={recorderBusy}
          onOpenPalette={() => setShowPalette(true)}
          onOpenShortcuts={() => setShowShortcuts(true)}
          onOpenSettings={() => setShowSettings(true)}
        >
          {state.view === 'EDITOR' && (
            <>
              <IconButton title="Undo (⌘Z)" disabled={!canUndo(undoable)} onClick={() => dispatch({ type: 'UNDO' })}>
                <Icons.Undo size={14} />
              </IconButton>
              <IconButton title="Redo (⇧⌘Z)" disabled={!canRedo(undoable)} onClick={() => dispatch({ type: 'REDO' })}>
                <Icons.Redo size={14} />
              </IconButton>
              <div className="h-6 w-[1px] bg-zinc-800 mx-1" />
              <IconButton title={`Snapping ${state.snapping ? 'on' : 'off'} (hold Alt to bypass)`} active={state.snapping} onClick={() => dispatch({ type: 'TOGGLE_SNAPPING' })}>
                <Icons.Magnet size={14} />
              </IconButton>
              <IconButton title="Auto-fit timeline" active={state.isAutoFit} onClick={() => dispatch({ type: 'TOGGLE_AUTO_FIT' })}>
                <Icons.Layout size={14} />
              </IconButton>
              <IconButton title="Fit view once" onClick={() => dispatch({ type: 'TRIGGER_FIT_VIEW' })}>
                <Icons.Maximize size={14} />
              </IconButton>
              <div className="flex items-center gap-3 bg-zinc-900 rounded-lg px-3 py-1.5 border border-zinc-800 mx-1">
                <button onClick={() => dispatch({ type: 'SET_ZOOM', payload: state.zoom - 10 })}>
                  <Icons.ZoomOut size={14} className="text-gray-400 hover:text-white" />
                </button>
                <span className="text-[10px] font-mono text-gray-400 w-10 text-center">
                  {Math.round(state.zoom)}%
                </span>
                <button onClick={() => dispatch({ type: 'SET_ZOOM', payload: state.zoom + 10 })}>
                  <Icons.ZoomIn size={14} className="text-gray-400 hover:text-white" />
                </button>
              </div>
            </>
          )}
        </AppHeader>

        {state.view === 'RECORDER' && (
          <div className="flex-1 relative min-h-0">
            <Suspense
              fallback={
                <div className="h-full flex items-center justify-center text-zinc-500 gap-3">
                  <Icons.Spinner size={20} className="animate-spin" /> Loading Recorder Studio…
                </div>
              }
            >
              <RecorderStudio
                onSave={(items: LibraryItem[]) => void handleRecorderSave(items)}
                onBusyChange={setRecorderBusy}
              />
            </Suspense>
          </div>
        )}

        {state.view === 'EDITOR' && (
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 flex flex-col relative min-w-0">
              <Timeline state={state} dispatch={dispatch} onContextMenu={handleContextMenu} />
            </div>
            <RightSidebar
              state={state}
              dispatch={dispatch}
              width={sidebarWidth}
              setWidth={setSidebarWidth}
              onOpenSettings={() => setShowSettings(true)}
            />
          </div>
        )}

        {state.view === 'GALLERY' && <GalleryPage state={state} dispatch={dispatch} />}

        {/* Clip / canvas context menu */}
        {contextMenu.visible && (
          <div
            className="fixed z-[100] bg-black border border-zinc-800 rounded-lg shadow-2xl py-1 w-52 text-sm"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            {contextMenu.targetId ? (
              <>
                <div className="px-4 py-1 text-[10px] text-gray-500 font-bold uppercase">
                  {state.selectedIds.length > 1
                    ? `${state.selectedIds.length} Items Selected`
                    : 'Actions'}
                </div>
                {selectedElement?.type === ElementType.IMAGE && (
                  <button
                    className="w-full text-left px-4 py-2 hover:bg-lime-900/20 text-lime-400 flex items-center gap-2"
                    onClick={() => void handleRemoveBg(contextMenu.targetId as string)}
                    disabled={isProcessingBg}
                  >
                    <Icons.Magic size={14} />{' '}
                    {isProcessingBg ? 'Processing…' : 'Magic: Remove BG'}
                  </button>
                )}
                <button
                  className="w-full text-left px-4 py-2 hover:bg-zinc-900 flex items-center gap-2"
                  onClick={() => dispatch({ type: 'COPY_SELECTED', payload: contextMenu.targetId ?? undefined })}
                >
                  <Icons.Copy size={14} /> Copy
                </button>
                <button
                  className="w-full text-left px-4 py-2 hover:bg-zinc-900 flex items-center gap-2"
                  onClick={() => dispatch({ type: 'DUPLICATE_SELECTED' })}
                >
                  <Icons.Clipboard size={14} /> Duplicate
                </button>
                <button
                  className="w-full text-left px-4 py-2 hover:bg-zinc-900 flex items-center gap-2"
                  onClick={() => dispatch({ type: 'SPLIT_CLIP', payload: contextMenu.targetId })}
                >
                  <Icons.Scissors size={14} /> Split at Playhead
                </button>
                {selectedElement?.type === ElementType.VIDEO && (
                  <button
                    className="w-full text-left px-4 py-2 hover:bg-zinc-900 flex items-center gap-2"
                    onClick={() => dispatch({ type: 'EXTRACT_AUDIO', payload: contextMenu.targetId })}
                  >
                    <Icons.Music size={14} /> Extract Audio
                  </button>
                )}
                <button
                  className="w-full text-left px-4 py-2 hover:bg-zinc-900 flex items-center gap-2"
                  onClick={() => dispatch({ type: 'CROSSFADE_WITH_NEXT', payload: contextMenu.targetId as string })}
                >
                  <Icons.Film size={14} /> Crossfade with Next
                </button>
                <div className="h-[1px] bg-zinc-800 my-1" />
                <button
                  className="w-full text-left px-4 py-2 hover:bg-red-900/20 text-red-500 flex items-center gap-2"
                  onClick={() => dispatch({ type: 'DELETE_SELECTED' })}
                >
                  <Icons.Trash size={14} /> Delete Selected
                </button>
              </>
            ) : (
              <>
                <div className="px-4 py-1 text-xs text-gray-500 font-bold uppercase tracking-wider">
                  Add to Canvas
                </div>
                {state.clipboard && state.clipboard.length > 0 && (
                  <button
                    className="w-full text-left px-4 py-2 hover:bg-zinc-900 flex items-center gap-2"
                    onClick={() => dispatch({ type: 'PASTE_CLIPBOARD' })}
                  >
                    <Icons.Clipboard size={14} /> Paste
                  </button>
                )}
                <button
                  className="w-full text-left px-4 py-2 hover:bg-zinc-900 flex items-center gap-2"
                  onClick={() =>
                    dispatch({
                      type: 'ADD_ELEMENT',
                      payload: createElement({
                        type: ElementType.TEXT,
                        name: 'Text Overlay',
                        text: 'Double Click to Edit',
                        startTime: state.currentTime,
                        duration: 3,
                      }),
                    })
                  }
                >
                  <Icons.Type size={14} /> Add Text
                </button>
              </>
            )}
          </div>
        )}

        {/* Modals */}
        {boot === 'welcome' && (
          <WelcomeModal
            onStartRecording={() => {
              setBoot('ready');
              dispatch({ type: 'SET_VIEW', payload: 'RECORDER' });
            }}
            onStartEditing={() => setBoot('ready')}
            onLoadDemo={() => void loadDemo()}
          />
        )}
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
        {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
        {showPalette && (
          <CommandPalette commands={paletteCommands} onClose={() => setShowPalette(false)} />
        )}
      </div>
    </div>
  );
};

export default App;
