
import React, { useReducer, useEffect, useRef, useState } from 'react';
import { EditorState, CanvasElement, ElementType, ContextMenuState, LibraryItem } from './types';
import { DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM, DEFAULT_FONT_SIZE, DEFAULT_IMAGE_DURATION } from './constants';
import { Timeline } from './components/Canvas/Timeline';
import { RightSidebar } from './components/Sidebar/RightSidebar';
import { RecorderStudio } from './components/RecorderStudio';
import { Icons } from './components/Icon';

// Empty Initial Library
const initialLibrary: LibraryItem[] = [];

const initialState: EditorState = {
  elements: [],
  library: initialLibrary,
  currentTime: 0,
  isPlaying: false,
  zoom: DEFAULT_ZOOM,
  selectedIds: [],
  duration: 60,
  canvasMode: 'landscape',
  seekVersion: 0,
  clipboard: null,
  view: 'EDITOR',
  isAutoFit: false,
  fitVersion: 0
};

const reducer = (state: EditorState, action: any): EditorState => {
  switch (action.type) {
    case 'SET_VIEW':
      return { ...state, view: action.payload };
    case 'ADD_ELEMENT':
      return { 
        ...state, 
        elements: [...state.elements, { 
            ...action.payload, 
            fontSize: action.payload.fontSize || DEFAULT_FONT_SIZE,
            fadeIn: action.payload.fadeIn || 0,
            fadeOut: action.payload.fadeOut || 0,
            playbackRate: action.payload.playbackRate || 1
        }],
        selectedIds: [action.payload.id], // Auto-select new item
        duration: Math.max(state.duration, action.payload.startTime + action.payload.duration + 10)
      };
    case 'UPDATE_ELEMENT': 
      return {
        ...state,
        elements: state.elements.map(el => 
          el.id === action.payload.id ? { ...el, ...action.payload.changes } : el
        )
      };
    case 'UPDATE_ELEMENTS': 
      return {
        ...state,
        elements: state.elements.map(el => 
          action.payload.ids.includes(el.id) ? { ...el, ...action.payload.changes } : el
        )
      };
    case 'MOVE_ELEMENTS': 
      return {
        ...state,
        elements: state.elements.map(el => {
            const update = action.payload.updates.find((u: any) => u.id === el.id);
            return update ? { ...el, ...update.changes } : el;
        })
      };
    case 'SELECT_ELEMENT':
      return { ...state, selectedIds: action.payload ? [action.payload] : [] };
    case 'SET_SELECTION':
      return { ...state, selectedIds: action.payload }; 
    case 'DESELECT_ALL':
      return { ...state, selectedIds: [] };
    case 'SET_TIME':
      return { ...state, currentTime: Math.max(0, action.payload) };
    case 'SEEK':
      return { ...state, currentTime: Math.max(0, action.payload), seekVersion: state.seekVersion + 1 };
    case 'TOGGLE_PLAY':
      return { ...state, isPlaying: !state.isPlaying };
    case 'SET_ZOOM':
      return { ...state, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, action.payload)) };
    case 'TOGGLE_AUTO_FIT':
      return { ...state, isAutoFit: !state.isAutoFit };
    case 'TRIGGER_FIT_VIEW':
      return { ...state, fitVersion: state.fitVersion + 1, isAutoFit: false };
    case 'DELETE_SELECTED':
      return { ...state, elements: state.elements.filter(e => !state.selectedIds.includes(e.id)), selectedIds: [] };
    case 'DELETE_ELEMENT': 
      return { 
          ...state, 
          elements: state.elements.filter(e => e.id !== action.payload), 
          selectedIds: state.selectedIds.filter(id => id !== action.payload) 
      };
    case 'SET_CANVAS_MODE':
      return { ...state, canvasMode: action.payload };
    case 'COPY_ELEMENT': {
      const idToCopy = action.payload || state.selectedIds[0];
      const el = state.elements.find(e => e.id === idToCopy);
      return { ...state, clipboard: el || null };
    }
    case 'PASTE_ELEMENT': {
      if (!state.clipboard) return state;
      const newEl = {
          ...state.clipboard,
          id: Math.random().toString(36),
          startTime: state.currentTime,
          trackId: state.clipboard.trackId, 
          name: `${state.clipboard.name} (Copy)`
      };
      return {
          ...state,
          elements: [...state.elements, newEl],
          selectedIds: [newEl.id]
      };
    }
    case 'EXTRACT_AUDIO': {
      const idsToProcess = action.payload ? [action.payload] : state.selectedIds;
      let newElements = [...state.elements];
      idsToProcess.forEach(id => {
          const vid = newElements.find(e => e.id === id);
          if (vid && vid.type === ElementType.VIDEO) {
             const audioEl: CanvasElement = {
                ...vid,
                id: Math.random().toString(36),
                type: ElementType.AUDIO,
                trackId: vid.trackId + 1,
                name: `${vid.name} (Audio)`,
                opacity: 1, 
                fadeIn: 0, fadeOut: 0,
                volume: vid.volume
             };
             newElements = newElements.map(e => e.id === vid.id ? { ...e, volume: 0 } : e).concat(audioEl);
          }
      });
      return { ...state, elements: newElements };
    }
    case 'SPLIT_CLIP': {
       const idToSplit = action.payload || state.selectedIds[0];
       const el = state.elements.find(e => e.id === idToSplit);
       if (!el) return state;
       const splitTime = state.currentTime;
       if (splitTime <= el.startTime || splitTime >= el.startTime + el.duration) return state;
       const firstDurationOnTimeline = splitTime - el.startTime;
       const secondDurationOnTimeline = el.duration - firstDurationOnTimeline;
       const mediaTimePassed = firstDurationOnTimeline * (el.playbackRate || 1);
       const part1 = { ...el, duration: firstDurationOnTimeline };
       const part2 = { ...el, id: Math.random().toString(36), startTime: splitTime, duration: secondDurationOnTimeline, trimStart: el.trimStart + mediaTimePassed };
       const newElements = state.elements.map(e => e.id === el.id ? part1 : e).concat(part2);
       return { ...state, elements: newElements, selectedIds: [part2.id] };
    }
    case 'ADD_LIBRARY_ITEM':
        return { ...state, library: [...state.library, action.payload] };
    case 'ADD_LIBRARY_ITEMS': 
        return { ...state, library: [...state.library, ...action.payload] };
    case 'DELETE_LIBRARY_ITEM':
        return { ...state, library: state.library.filter(item => item.id !== action.payload) };
    default:
      return state;
  }
};

const getMediaDuration = (src: string, type: ElementType): Promise<number> => {
  return new Promise((resolve) => {
    if (type === ElementType.IMAGE || type === ElementType.TEXT) {
        resolve(DEFAULT_IMAGE_DURATION); 
        return;
    }
    const el = type === ElementType.VIDEO ? document.createElement('video') : document.createElement('audio');
    el.src = src;
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
        const d = el.duration;
        resolve(Number.isFinite(d) ? d : DEFAULT_IMAGE_DURATION);
    };
    el.onerror = () => {
        resolve(DEFAULT_IMAGE_DURATION);
    };
  });
};

const App: React.FC = () => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const requestRef = useRef<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, targetId: null });
  const [sidebarWidth, setSidebarWidth] = useState(320);

  // Playback Loop
  useEffect(() => {
    if (state.isPlaying) {
      const startTime = performance.now();
      const startOffset = state.currentTime;
      const animate = () => {
        const now = performance.now();
        const elapsed = (now - startTime) / 1000;
        const newTime = startOffset + elapsed;
        if (newTime >= state.duration) {
            dispatch({ type: 'TOGGLE_PLAY' });
            return;
        }
        dispatch({ type: 'SET_TIME', payload: newTime });
        requestRef.current = requestAnimationFrame(animate);
      };
      requestRef.current = requestAnimationFrame(animate);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [state.isPlaying, state.seekVersion]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (state.view !== 'EDITOR') return; 
        if (e.code === 'Space') {
            const target = e.target as HTMLElement;
            if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                dispatch({ type: 'TOGGLE_PLAY' });
            }
        }
        if (e.code === 'Backspace' || e.code === 'Delete') {
             const target = e.target as HTMLElement;
             if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && state.selectedIds.length > 0) {
                 dispatch({ type: 'DELETE_SELECTED' });
             }
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.selectedIds, state.view]);

  const handleContextMenu = (e: React.MouseEvent, id: string | null) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      targetId: id
    });
  };

  const closeContextMenu = () => setContextMenu({ ...contextMenu, visible: false });

  const handleAppDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (state.view !== 'EDITOR') return;
    const maxTrackId = state.elements.length > 0 
        ? Math.max(...state.elements.map(e => e.trackId)) 
        : -1;
    const targetTrackId = maxTrackId + 1;
    if (e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files) as File[];
        let insertTime = state.currentTime;
        for (const file of files) {
             const url = URL.createObjectURL(file);
             let type: ElementType = ElementType.IMAGE;
             if (file.type.startsWith('video/')) type = ElementType.VIDEO;
             if (file.type.startsWith('audio/')) type = ElementType.AUDIO;
             const duration = await getMediaDuration(url, type);
             const libItem: LibraryItem = {
                 id: Math.random().toString(36),
                 type,
                 src: url,
                 name: file.name,
                 category: type === ElementType.VIDEO ? 'VIDEO' : type === ElementType.AUDIO ? 'AUDIO' : 'IMAGE',
                 duration
             };
             dispatch({ type: 'ADD_LIBRARY_ITEM', payload: libItem });
             const newEl: CanvasElement = {
                 id: Math.random().toString(36),
                 type,
                 src: url,
                 name: file.name,
                 startTime: insertTime,
                 duration: duration,
                 trackId: targetTrackId, 
                 volume: 1, opacity: 1, rotation: 0, scale: 1, trimStart: 0, 
                 fontSize: DEFAULT_FONT_SIZE,
                 fadeIn: 0, fadeOut: 0,
                 playbackRate: 1
             };
             dispatch({ type: 'ADD_ELEMENT', payload: newEl });
             insertTime += duration;
        }
        return;
    }
    const type = e.dataTransfer.getData('type') as ElementType;
    const src = e.dataTransfer.getData('src');
    const name = e.dataTransfer.getData('name');
    const durationRaw = e.dataTransfer.getData('duration');
    const duration = durationRaw ? parseFloat(durationRaw) : DEFAULT_IMAGE_DURATION;
    if (type && src) {
        const newEl: CanvasElement = {
            id: Math.random().toString(36),
            type: type,
            src,
            name: name || (type === ElementType.VIDEO ? 'New Video' : 'New Image'),
            startTime: state.currentTime,
            duration: duration,
            trackId: targetTrackId, 
            volume: 1, opacity: 1, rotation: 0, scale: 1, trimStart: 0, 
            fontSize: DEFAULT_FONT_SIZE,
            fadeIn: 0, fadeOut: 0,
            playbackRate: 1
        };
        dispatch({ type: 'ADD_ELEMENT', payload: newEl });
    }
  };

  return (
    <div 
        className="h-screen w-screen bg-black flex items-center justify-center p-6 text-stone-200 overflow-hidden" 
        onClick={closeContextMenu}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleAppDrop}
    >
        <div className="w-full h-full max-w-[1920px] bg-black rounded-3xl border border-zinc-800 shadow-2xl overflow-hidden flex flex-col relative">
            
            {state.view === 'RECORDER' ? (
                <RecorderStudio 
                    onBack={() => dispatch({ type: 'SET_VIEW', payload: 'EDITOR' })}
                    onSave={(items) => {
                        dispatch({ type: 'ADD_LIBRARY_ITEMS', payload: items });
                        dispatch({ type: 'SET_VIEW', payload: 'EDITOR' });
                    }}
                />
            ) : (
                <>
                    <div className="h-14 bg-black border-b border-zinc-800 flex items-center px-6 justify-between z-20 shrink-0">
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2 cursor-pointer" onClick={() => dispatch({ type: 'SET_VIEW', payload: 'EDITOR' })}>
                                <div className="w-8 h-8 bg-lime-800 rounded-lg flex items-center justify-center">
                                    <Icons.Layers size={18} className="text-white" />
                                </div>
                                <h1 className="font-bold text-lg tracking-tight text-white">Chroma<span className="text-lime-500">Canvas</span></h1>
                            </div>
                            <div className="h-6 w-[1px] bg-zinc-800"></div>
                            <button 
                                onClick={() => dispatch({ type: 'SET_VIEW', payload: 'RECORDER' })}
                                className="flex items-center gap-2 group"
                            >
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-transparent group-hover:bg-zinc-900 rounded-lg transition-colors">
                                    <Icons.Layout size={18} className="text-lime-500" />
                                    <span className="font-bold text-lg tracking-tight text-white">Studio</span>
                                </div>
                            </button>
                        </div>
                        
                        <div className="flex items-center gap-2">
                            {/* Fit Controls placed to the left of zoom per user request */}
                            <div className="flex items-center gap-1 mr-2">
                                <button 
                                    onClick={() => dispatch({ type: 'TOGGLE_AUTO_FIT' })}
                                    className={`px-3 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all ${state.isAutoFit ? 'bg-lime-600 border-lime-500 text-white' : 'bg-zinc-900 border-zinc-800 text-gray-400 hover:text-white hover:bg-zinc-800'}`}
                                >
                                    <Icons.Layout size={12} /> Auto Fit
                                </button>
                                <button 
                                    onClick={() => dispatch({ type: 'TRIGGER_FIT_VIEW' })}
                                    className="px-3 py-1.5 rounded-full border border-zinc-800 bg-zinc-900 text-gray-400 hover:text-white hover:bg-zinc-800 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all"
                                >
                                    <Icons.Maximize size={12} /> Fit View
                                </button>
                            </div>

                            <div className="flex items-center gap-4 bg-zinc-900 rounded-full px-3 py-1.5 border border-zinc-800">
                                <button onClick={() => dispatch({ type: 'SET_ZOOM', payload: state.zoom - 10 })}><Icons.ZoomOut size={16} className="text-gray-400 hover:text-white" /></button>
                                <span className="text-xs font-mono text-gray-400 w-12 text-center">{Math.round(state.zoom)}%</span>
                                <button onClick={() => dispatch({ type: 'SET_ZOOM', payload: state.zoom + 10 })}><Icons.ZoomIn size={16} className="text-gray-400 hover:text-white" /></button>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 flex overflow-hidden">
                        <div className="flex-1 flex flex-col relative min-w-0">
                            <Timeline state={state} dispatch={dispatch} onContextMenu={handleContextMenu} />
                        </div>
                        <RightSidebar state={state} dispatch={dispatch} width={sidebarWidth} setWidth={setSidebarWidth} />
                    </div>
                </>
            )}

            {contextMenu.visible && (
                <div 
                    className="fixed z-[100] bg-black border border-zinc-800 rounded-lg shadow-2xl py-1 w-48 text-sm animate-in fade-in zoom-in-95 duration-100"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                >
                    {contextMenu.targetId ? (
                        <>
                            <div className="px-4 py-1 text-[10px] text-gray-500 font-bold uppercase">
                                {state.selectedIds.length > 1 ? `${state.selectedIds.length} Items Selected` : 'Actions'}
                            </div>
                            <button className="w-full text-left px-4 py-2 hover:bg-zinc-900 flex items-center gap-2" onClick={() => dispatch({ type: 'COPY_ELEMENT', payload: contextMenu.targetId })}>
                                <Icons.Copy size={14} /> Copy
                            </button>
                            <button className="w-full text-left px-4 py-2 hover:bg-zinc-900 flex items-center gap-2" onClick={() => dispatch({ type: 'SPLIT_CLIP', payload: contextMenu.targetId })}>
                                <Icons.Scissors size={14} /> Split Clip
                            </button>
                            <button className="w-full text-left px-4 py-2 hover:bg-zinc-900 flex items-center gap-2" onClick={() => dispatch({ type: 'EXTRACT_AUDIO', payload: null })}>
                                <Icons.Music size={14} /> Extract Audio (All)
                            </button>
                            <div className="h-[1px] bg-zinc-800 my-1" />
                            <button className="w-full text-left px-4 py-2 hover:bg-red-900/20 text-red-500 flex items-center gap-2" onClick={() => dispatch({ type: 'DELETE_SELECTED' })}>
                                <Icons.Trash size={14} /> Delete Selected
                            </button>
                        </>
                    ) : (
                        <>
                        <div className="px-4 py-1 text-xs text-gray-500 font-bold uppercase tracking-wider">Add to Canvas</div>
                        {state.clipboard && (
                                <button className="w-full text-left px-4 py-2 hover:bg-zinc-900 flex items-center gap-2" onClick={() => dispatch({ type: 'PASTE_ELEMENT' })}>
                                    <Icons.Clipboard size={14} /> Paste
                                </button>
                        )}
                        <button 
                                className="w-full text-left px-4 py-2 hover:bg-zinc-900 flex items-center gap-2"
                                onClick={() => {
                                    const newEl = {
                                        id: Math.random().toString(),
                                        type: ElementType.TEXT,
                                        name: "Text Overlay",
                                        text: "Double Click to Edit",
                                        startTime: state.currentTime, 
                                        duration: 3,
                                        trackId: 0,
                                        volume: 0, opacity: 1, rotation: 0, scale: 1, trimStart: 0,
                                        fontSize: DEFAULT_FONT_SIZE,
                                        fadeIn: 0, fadeOut: 0,
                                        playbackRate: 1
                                    };
                                    dispatch({ type: 'ADD_ELEMENT', payload: newEl });
                                }}
                        >
                                <Icons.Type size={14} /> Add Text
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    </div>
  );
};

export default App;
