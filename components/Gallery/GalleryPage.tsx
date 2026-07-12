import React, { useEffect, useMemo, useState } from 'react';
import {
  EditorDispatch,
  EditorState,
  ElementType,
  LibraryCategory,
  LibraryItem,
} from '../../types';
import { Icons } from '../Icon';
import { toast } from '../ui/Toast';
import { createElement } from '../../utils/elements';
import { formatTime } from '../../utils/media';

/**
 * The Gallery page: every media file in the project — recordings, imports, and
 * AI generations — in one organized, searchable grid. Right-click (or the ⋯
 * button) to insert a file into the Media Editor as a new track, preview it,
 * download it, or remove it.
 */

interface Props {
  state: EditorState;
  dispatch: EditorDispatch;
}

type Filter = 'ALL' | LibraryCategory;

const FILTERS: { id: Filter; label: string; icon: React.ReactNode }[] = [
  { id: 'ALL', label: 'All', icon: <Icons.Layers size={12} /> },
  { id: 'VIDEO', label: 'Videos', icon: <Icons.Video size={12} /> },
  { id: 'IMAGE', label: 'Images', icon: <Icons.Image size={12} /> },
  { id: 'AUDIO', label: 'Audio', icon: <Icons.Music size={12} /> },
  { id: 'OVERLAY', label: 'Overlays', icon: <Icons.Sparkles size={12} /> },
  { id: 'GIF', label: 'GIFs', icon: <Icons.Film size={12} /> },
];

const CATEGORY_BADGE: Record<LibraryCategory, string> = {
  VIDEO: 'bg-blue-900/70 text-blue-200',
  IMAGE: 'bg-lime-900/70 text-lime-200',
  AUDIO: 'bg-emerald-900/70 text-emerald-200',
  OVERLAY: 'bg-purple-900/70 text-purple-200',
  GIF: 'bg-pink-900/70 text-pink-200',
  TRANSITION: 'bg-zinc-800 text-zinc-300',
};

interface MenuState {
  x: number;
  y: number;
  item: LibraryItem;
}

const CardPreview: React.FC<{ item: LibraryItem }> = ({ item }) => {
  if (item.type === ElementType.AUDIO) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-emerald-950 to-black flex items-center justify-center">
        <div className="flex items-end gap-1 h-10">
          {[4, 7, 5, 9, 6, 8, 3, 7, 5].map((h, i) => (
            <div key={i} className="w-1.5 bg-emerald-400/70 rounded-t" style={{ height: `${h * 4}px` }} />
          ))}
        </div>
      </div>
    );
  }
  if (item.type === ElementType.VIDEO) {
    return (
      <video
        src={item.src}
        preload="metadata"
        muted
        className="w-full h-full object-cover"
        onMouseEnter={(e) => {
          e.currentTarget.play().catch(() => {});
        }}
        onMouseLeave={(e) => {
          e.currentTarget.pause();
          e.currentTarget.currentTime = 0;
        }}
      />
    );
  }
  return <img src={item.src} className="w-full h-full object-cover" alt="" loading="lazy" />;
};

export const GalleryPage: React.FC<Props> = ({ state, dispatch }) => {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [lightbox, setLightbox] = useState<LibraryItem | null>(null);

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.library
      .filter((item) => filter === 'ALL' || item.category === filter)
      .filter((item) => !q || item.name.toLowerCase().includes(q));
  }, [state.library, filter, search]);

  useEffect(() => {
    const close = () => setMenu(null);
    if (menu) window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menu]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightbox(null);
        setMenu(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openMenu = (e: React.MouseEvent, item: LibraryItem) => {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 230);
    const y = Math.min(e.clientY, window.innerHeight - 220);
    setMenu({ x, y, item });
  };

  const insertIntoEditor = (item: LibraryItem) => {
    const maxTrackId = state.elements.length
      ? Math.max(...state.elements.map((el) => el.trackId))
      : -1;
    const duration = item.duration ?? 5;
    dispatch({
      type: 'ADD_ELEMENT',
      payload: createElement({
        type: item.type,
        src: item.src,
        mediaId: item.mediaId,
        name: item.name,
        startTime: state.currentTime,
        duration,
        sourceDuration:
          item.type === ElementType.VIDEO || item.type === ElementType.AUDIO
            ? duration
            : undefined,
        trackId: maxTrackId + 1,
      }),
    });
    dispatch({ type: 'SET_VIEW', payload: 'EDITOR' });
    toast(`"${item.name}" added to the timeline on track ${maxTrackId + 2}.`, 'success');
  };

  const downloadItem = (item: LibraryItem) => {
    const a = document.createElement('a');
    a.href = item.src;
    a.download = item.name;
    a.target = '_blank';
    a.click();
  };

  const counts = useMemo(() => {
    const map = new Map<Filter, number>();
    map.set('ALL', state.library.length);
    state.library.forEach((item) => {
      map.set(item.category, (map.get(item.category) ?? 0) + 1);
    });
    return map;
  }, [state.library]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0c0c0e]">
      {/* Toolbar */}
      <div className="shrink-0 px-6 py-4 border-b border-zinc-900 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTERS.map((f) => {
            const count = counts.get(f.id) ?? 0;
            if (f.id !== 'ALL' && count === 0) return null;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-bold transition-colors ${
                  filter === f.id
                    ? 'bg-lime-900/50 border-lime-600/60 text-white'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                {f.icon} {f.label}
                <span className="text-[9px] font-mono opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="flex-1" />
        <div className="relative">
          <Icons.Sliders
            size={12}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search media…"
            className="bg-zinc-900 border border-zinc-800 rounded-full pl-8 pr-4 py-1.5 text-xs text-white focus:outline-none focus:border-lime-500 w-56"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        {items.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-3 max-w-sm">
              <Icons.Image size={36} className="mx-auto text-zinc-700" />
              <p className="text-sm text-zinc-500">
                {state.library.length === 0
                  ? 'Your gallery is empty. Record something in the Recorder Studio, drop files into the Media Editor, or generate images with AI — everything lands here.'
                  : 'No media matches this filter.'}
              </p>
              {state.library.length === 0 && (
                <button
                  onClick={() => dispatch({ type: 'SET_VIEW', payload: 'RECORDER' })}
                  className="px-4 py-2 bg-lime-800 hover:bg-lime-700 text-white text-xs font-bold rounded-lg"
                >
                  Open Recorder Studio
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {items.map((item) => (
              <div
                key={item.id}
                className="group bg-zinc-950 border border-zinc-800 hover:border-lime-500/60 rounded-xl overflow-hidden cursor-pointer transition-all hover:shadow-lg hover:shadow-lime-500/5"
                onClick={() => setLightbox(item)}
                onContextMenu={(e) => openMenu(e, item)}
                title="Click to preview · right-click for actions"
              >
                <div className="aspect-video bg-black relative overflow-hidden">
                  <CardPreview item={item} />
                  {item.duration !== undefined && item.type !== ElementType.IMAGE && (
                    <span className="absolute bottom-1.5 right-1.5 bg-black/70 backdrop-blur px-1.5 py-0.5 rounded text-[10px] font-mono text-white/90">
                      {formatTime(item.duration)}
                    </span>
                  )}
                  <button
                    className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 bg-black/70 hover:bg-black rounded-full p-1.5 text-white transition-opacity"
                    onClick={(e) => openMenu(e, item)}
                    title="Actions"
                  >
                    <Icons.Drag size={12} />
                  </button>
                </div>
                <div className="p-3 flex items-center gap-2">
                  <p className="flex-1 text-xs text-zinc-200 truncate">{item.name}</p>
                  <span
                    className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${CATEGORY_BADGE[item.category]}`}
                  >
                    {item.category}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Context menu */}
      {menu && (
        <div
          className="fixed z-[120] bg-black border border-zinc-800 rounded-lg shadow-2xl py-1 w-56 text-sm"
          style={{ top: menu.y, left: menu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-1.5 text-[10px] text-gray-500 font-bold uppercase truncate">
            {menu.item.name}
          </div>
          <button
            className="w-full text-left px-4 py-2 hover:bg-lime-900/20 text-lime-400 flex items-center gap-2"
            onClick={() => {
              insertIntoEditor(menu.item);
              setMenu(null);
            }}
          >
            <Icons.Plus size={14} /> Add to Editor as Track
          </button>
          <button
            className="w-full text-left px-4 py-2 hover:bg-zinc-900 flex items-center gap-2"
            onClick={() => {
              setLightbox(menu.item);
              setMenu(null);
            }}
          >
            <Icons.Play size={14} /> {menu.item.type === ElementType.IMAGE ? 'View' : 'Play'}
          </button>
          <button
            className="w-full text-left px-4 py-2 hover:bg-zinc-900 flex items-center gap-2"
            onClick={() => {
              downloadItem(menu.item);
              setMenu(null);
            }}
          >
            <Icons.Download size={14} /> Download
          </button>
          <div className="h-[1px] bg-zinc-800 my-1" />
          <button
            className="w-full text-left px-4 py-2 hover:bg-red-900/20 text-red-500 flex items-center gap-2"
            onClick={() => {
              dispatch({ type: 'DELETE_LIBRARY_ITEM', payload: menu.item.id });
              setMenu(null);
              toast('Removed from library.', 'info');
            }}
          >
            <Icons.Trash size={14} /> Remove from Library
          </button>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[130] bg-black/90 backdrop-blur-sm flex items-center justify-center p-8"
          onClick={() => setLightbox(null)}
        >
          <div
            className="max-w-5xl w-full max-h-full flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-white font-bold truncate">{lightbox.name}</p>
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-1.5 bg-lime-800 hover:bg-lime-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5"
                  onClick={() => {
                    insertIntoEditor(lightbox);
                    setLightbox(null);
                  }}
                >
                  <Icons.Plus size={12} /> Add to Editor
                </button>
                <button
                  className="p-2 text-zinc-400 hover:text-white"
                  onClick={() => setLightbox(null)}
                >
                  <Icons.X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 flex items-center justify-center bg-black rounded-xl border border-zinc-800 overflow-hidden">
              {lightbox.type === ElementType.VIDEO && (
                <video src={lightbox.src} controls autoPlay className="max-w-full max-h-[75vh]" />
              )}
              {lightbox.type === ElementType.IMAGE && (
                <img src={lightbox.src} className="max-w-full max-h-[75vh] object-contain" alt="" />
              )}
              {lightbox.type === ElementType.AUDIO && (
                <div className="p-12 w-full flex flex-col items-center gap-6">
                  <div className="w-20 h-20 bg-emerald-900/30 rounded-full flex items-center justify-center">
                    <Icons.Music size={36} className="text-emerald-400" />
                  </div>
                  <audio src={lightbox.src} controls autoPlay className="w-full max-w-md" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
