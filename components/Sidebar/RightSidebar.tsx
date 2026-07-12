import React, { useEffect, useRef, useState } from 'react';
import { EditorDispatch, EditorState } from '../../types';
import { Icons } from '../Icon';
import { toast } from '../ui/Toast';
import { Preview } from '../Preview/Preview';
import { GalleryTab } from './GalleryTab';
import { OverlaysTab } from './OverlaysTab';
import { TransitionsTab } from './TransitionsTab';
import { AdjustTab } from './AdjustTab';
import { docOf } from '../../state/history';
import {
  ExportSignal,
  exportVideo,
  isWebCodecsSupported,
} from '../../export/exporter';

interface RightSidebarProps {
  state: EditorState;
  dispatch: EditorDispatch;
  width: number;
  setWidth: (w: number) => void;
  onOpenSettings: () => void;
}

type Tab = 'gallery' | 'overlays' | 'transitions' | 'properties';

const TABS: { id: Tab; label: string }[] = [
  { id: 'gallery', label: 'Gallery' },
  { id: 'overlays', label: 'Overlays' },
  { id: 'transitions', label: 'Transitions' },
  { id: 'properties', label: 'Adjust' },
];

export const RightSidebar: React.FC<RightSidebarProps> = ({
  state,
  dispatch,
  width,
  setWidth,
  onOpenSettings,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('gallery');
  const resizeStartRef = useRef<number | null>(null);
  const resizeStartWidthRef = useRef<number | null>(null);
  const [galleryContextMenu, setGalleryContextMenu] = useState<{
    x: number;
    y: number;
    id: string | null;
  }>({ x: 0, y: 0, id: null });

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStage, setExportStage] = useState('');
  const [resolution, setResolution] = useState<'720p' | '1080p'>('720p');
  const exportSignalRef = useRef<ExportSignal>({ cancelled: false });

  // Auto-switch to Adjust when something gets selected the first time
  const prevSelected = useRef(0);
  useEffect(() => {
    if (state.selectedIds.length === 1 && prevSelected.current === 0 && activeTab === 'gallery') {
      // Keep gallery if user is browsing; only a gentle behavior on empty->selected
    }
    prevSelected.current = state.selectedIds.length;
  }, [state.selectedIds.length, activeTab]);

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    resizeStartRef.current = e.clientX;
    resizeStartWidthRef.current = width;
    const handleResizing = (ev: MouseEvent) => {
      if (resizeStartRef.current === null || resizeStartWidthRef.current === null) return;
      const delta = resizeStartRef.current - ev.clientX;
      setWidth(Math.max(280, Math.min(640, resizeStartWidthRef.current + delta)));
    };
    const stopResizing = () => {
      resizeStartRef.current = null;
      resizeStartWidthRef.current = null;
      document.removeEventListener('mousemove', handleResizing);
      document.removeEventListener('mouseup', stopResizing);
    };
    document.addEventListener('mousemove', handleResizing);
    document.addEventListener('mouseup', stopResizing);
  };

  const handleExport = async () => {
    if (isExporting) return;
    if (state.isPlaying) dispatch({ type: 'TOGGLE_PLAY' });
    setIsExporting(true);
    setExportProgress(0);
    setExportStage('Starting…');
    exportSignalRef.current = { cancelled: false };

    try {
      const result = await exportVideo(
        docOf(state),
        { resolution, fps: 30, canvasMode: state.canvasMode },
        (pct, stage) => {
          setExportProgress(pct);
          setExportStage(stage);
        },
        exportSignalRef.current,
      );
      if (result) {
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chromacanvas_${Date.now()}.${result.extension}`;
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
        toast(`Export complete (${result.extension.toUpperCase()}).`, 'success');
      } else {
        toast('Export cancelled.', 'info');
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Export failed.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleGalleryContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setGalleryContextMenu({ x: e.clientX, y: e.clientY, id });
  };

  useEffect(() => {
    const closeMenu = () => setGalleryContextMenu({ x: 0, y: 0, id: null });
    if (galleryContextMenu.id) window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, [galleryContextMenu.id]);

  return (
    <div
      className="bg-black border-l border-zinc-800 flex flex-col h-full z-50 shadow-xl relative"
      style={{ width }}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1 bg-transparent hover:bg-lime-500 cursor-ew-resize z-[60]"
        onMouseDown={startResizing}
      />

      <Preview state={state} dispatch={dispatch} />

      <div className="flex border-b border-zinc-800 shrink-0 overflow-x-auto custom-scrollbar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`flex-1 min-w-[70px] py-3 text-[10px] font-bold uppercase tracking-wider ${
              activeTab === tab.id
                ? 'text-white border-b-2 border-lime-500 bg-white/5'
                : 'text-gray-400 hover:text-white'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar relative bg-black">
        {activeTab === 'gallery' && (
          <GalleryTab
            state={state}
            dispatch={dispatch}
            onOpenSettings={onOpenSettings}
            onItemContextMenu={handleGalleryContextMenu}
          />
        )}
        {activeTab === 'overlays' && (
          <OverlaysTab
            state={state}
            dispatch={dispatch}
            onItemContextMenu={handleGalleryContextMenu}
          />
        )}
        {activeTab === 'transitions' && <TransitionsTab />}
        {activeTab === 'properties' && <AdjustTab state={state} dispatch={dispatch} />}
      </div>

      {/* Export bar */}
      <div className="p-4 border-t border-zinc-800 bg-black space-y-2 shrink-0">
        <div className="flex gap-2">
          <button
            onClick={() => dispatch({ type: 'SET_CANVAS_MODE', payload: 'landscape' })}
            title="Landscape 16:9"
            className={`flex-1 flex items-center justify-center p-2 rounded ${
              state.canvasMode === 'landscape'
                ? 'bg-lime-900 text-lime-400'
                : 'bg-zinc-900 text-gray-400 hover:text-white'
            }`}
          >
            <Icons.Landscape size={14} />
          </button>
          <button
            onClick={() => dispatch({ type: 'SET_CANVAS_MODE', payload: 'portrait' })}
            title="Portrait 9:16"
            className={`flex-1 flex items-center justify-center p-2 rounded ${
              state.canvasMode === 'portrait'
                ? 'bg-lime-900 text-lime-400'
                : 'bg-zinc-900 text-gray-400 hover:text-white'
            }`}
          >
            <Icons.Portrait size={14} />
          </button>
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value as '720p' | '1080p')}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2 text-xs text-white"
            title="Export resolution"
          >
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
          </select>
        </div>
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="w-full py-3 bg-white hover:bg-gray-200 disabled:opacity-50 text-black font-bold rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          <Icons.Download size={16} /> {isExporting ? 'Exporting…' : 'Export MP4'}
        </button>
        {!isWebCodecsSupported() && (
          <p className="text-[9px] text-zinc-600 text-center">
            Fast export unavailable in this browser — will record in realtime instead.
          </p>
        )}
      </div>

      {galleryContextMenu.id && (
        <div
          className="fixed z-[100] bg-black border border-zinc-800 shadow-xl rounded py-1 w-36"
          style={{ top: galleryContextMenu.y, left: galleryContextMenu.x }}
        >
          <button
            className="w-full text-left px-4 py-2 text-xs text-red-400 hover:bg-red-900/20 flex items-center gap-2"
            onClick={() =>
              dispatch({ type: 'DELETE_LIBRARY_ITEM', payload: galleryContextMenu.id as string })
            }
          >
            <Icons.Trash size={12} /> Remove from Library
          </button>
        </div>
      )}

      {isExporting && (
        <div className="fixed inset-0 z-[140] bg-black/85 flex items-center justify-center">
          <div className="bg-zinc-950 p-6 rounded-xl border border-zinc-800 w-96 text-center space-y-3">
            <h3 className="text-white font-bold">Exporting Video</h3>
            <div className="w-full h-2 bg-black rounded-full overflow-hidden">
              <div
                className="h-full bg-lime-500 transition-all duration-300"
                style={{ width: `${exportProgress}%` }}
              />
            </div>
            <p className="text-xs text-gray-400">
              {exportProgress}% · {exportStage}
            </p>
            {isWebCodecsSupported() && (
              <p className="text-[10px] text-zinc-600">
                Frame-accurate render — faster than realtime on most machines.
              </p>
            )}
            <button
              onClick={() => {
                exportSignalRef.current.cancelled = true;
              }}
              className="mt-1 text-xs text-red-400 hover:underline"
            >
              Cancel Export
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
