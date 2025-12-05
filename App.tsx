
import React, { useReducer, useEffect, useRef, useState } from 'react';
import { EditorState, CanvasElement, ElementType, ContextMenuState, LibraryItem } from './types';
import { DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM, DEFAULT_FONT_SIZE, DEFAULT_IMAGE_DURATION } from './constants';
import { Timeline } from './components/Canvas/Timeline';
import { RightSidebar } from './components/Sidebar/RightSidebar';
import { Icons } from './components/Icon';

// Empty Initial Library
const initialLibrary: LibraryItem[] = [];

const initialState: EditorState = {
  elements: [],
  library: initialLibrary,
  currentTime: 0,
  isPlaying: false,
  zoom: DEFAULT_ZOOM,
  selectedId: null,
  duration: 60,
  canvasMode: 'landscape',
  seekVersion: 0,
  clipboard: null
};

const reducer = (state: EditorState, action: any): EditorState => {
  switch (action.type) {
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
        duration: Math.max(state.duration, action.payload.startTime + action.payload.duration + 10)
      };
    case 'UPDATE_ELEMENT':
      return {
        ...state,
        elements: state.elements.map(el => 
          el.id === action.payload.id ? { ...el, ...action.payload.changes } : el
        )
      };
    case 'SELECT_ELEMENT':
      return { ...state, selectedId: action.payload };
    case 'DESELECT_ALL':
      return { ...state, selectedId: null };
    case 'SET_TIME':
      // Used by animation loop, does not increment seekVersion
      return { ...state, currentTime: Math.max(0, action.payload) };
    case 'SEEK':
      // Used by user interaction, increments seekVersion to restart loop
      return { ...state, currentTime: Math.max(0, action.payload), seekVersion: state.seekVersion + 1 };
    case 'TOGGLE_PLAY':
      return { ...state, isPlaying: !state.isPlaying };
    case 'SET_ZOOM':
      return { ...state, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, action.payload)) };
    case 'DELETE_ELEMENT':
      return { ...state, elements: state.elements.filter(e => e.id !== action.payload), selectedId: null };
    case 'SET_CANVAS_MODE':
      return { ...state, canvasMode: action.payload };
    case 'COPY_ELEMENT': {
      const el = state.elements.find(e => e.id === action.payload);
      return { ...state, clipboard: el || null };
    }
    case 'PASTE_ELEMENT': {
      if (!state.clipboard) return state;
      const newEl = {
          ...state.clipboard,
          id: Math.random().toString(36),
          startTime: state.currentTime,
          trackId: state.clipboard.trackId, // Ideally find free track, but simple paste is ok
          name: `${state.clipboard.name} (Copy)`
      };
      return {
          ...state,
          elements: [...state.elements, newEl]
      };
    }
    case 'EXTRACT_AUDIO': {
      const vid = state.elements.find(e => e.id === action.payload);
      if (!vid || vid.type !== ElementType.VIDEO) return state;
      
      // Create new audio element
      const audioEl: CanvasElement = {
          ...vid,
          id: Math.random().toString(36),
          type: ElementType.AUDIO,
          trackId: vid.trackId + 1,
          name: `${vid.name} (Audio)`,
          opacity: 1, 
          fadeIn: 0,
          fadeOut: 0,
          volume: vid.volume // inherit volume
      };

      // Mute the original video
      const mutedVideo = { ...vid, volume: 0 };

      return { 
          ...state, 
          elements: state.elements.map(e => e.id === vid.id ? mutedVideo : e).concat(audioEl) 
      };
    }
    case 'SPLIT_CLIP': {
       const el = state.elements.find(e => e.id === action.payload);
       if (!el) return state;
       const splitTime = state.currentTime;
       
       // Check bounds
       if (splitTime <= el.startTime || splitTime >= el.startTime + el.duration) return state;
       
       // Calculate split points
       const firstDurationOnTimeline = splitTime - el.startTime;
       const secondDurationOnTimeline = el.duration - firstDurationOnTimeline;
       
       // Calculate how much MEDIA time has passed based on playback rate
       const mediaTimePassed = firstDurationOnTimeline * (el.playbackRate || 1);

       const part1 = { 
           ...el, 
           duration: firstDurationOnTimeline 
       };
       
       const part2 = { 
           ...el, 
           id: Math.random().toString(36), 
           startTime: splitTime, 
           duration: secondDurationOnTimeline,
           trimStart: el.trimStart + mediaTimePassed 
       };
       
       return { 
           ...state, 
           elements: state.elements.map(e => e.id === el.id ? part1 : e).concat(part2) 
       };
    }
    case 'ADD_LIBRARY_ITEM':
        return {
            ...state,
            library: [...state.library, action.payload]
        };
    case 'DELETE_LIBRARY_ITEM':
        return {
            ...state,
            library: state.library.filter(item => item.id !== action.payload)
        };
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
        
        // Safety stop at end of duration
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
  }, [state.isPlaying, state.seekVersion]); // Re-run if play toggles OR if user manually seeks

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        // Spacebar to Toggle Play/Pause
        if (e.code === 'Space') {
            const target = e.target as HTMLElement;
            if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                dispatch({ type: 'TOGGLE_PLAY' });
            }
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

  // Handle drops specifically on the main app to catch drops on Timeline
  const handleAppDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    
    // Check if dropping a file from OS onto the canvas
    if (e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files) as File[];
        for (const file of files) {
             const url = URL.createObjectURL(file);
             let type: ElementType = ElementType.IMAGE;
             if (file.type.startsWith('video/')) type = ElementType.VIDEO;
             if (file.type.startsWith('audio/')) type = ElementType.AUDIO;

             const duration = await getMediaDuration(url, type);

             // Add to library first
             const libItem: LibraryItem = {
                 id: Math.random().toString(36),
                 type,
                 src: url,
                 name: file.name,
                 category: type === ElementType.VIDEO ? 'VIDEO' : type === ElementType.AUDIO ? 'AUDIO' : 'IMAGE',
                 duration
             };
             dispatch({ type: 'ADD_LIBRARY_ITEM', payload: libItem });

             // AND add to timeline at current playhead
             const newEl: CanvasElement = {
                 id: Math.random().toString(36),
                 type,
                 src: url,
                 name: file.name,
                 startTime: state.currentTime,
                 duration: duration,
                 trackId: 0,
                 volume: 1, opacity: 1, rotation: 0, scale: 1, trimStart: 0, 
                 fontSize: DEFAULT_FONT_SIZE,
                 fadeIn: 0, fadeOut: 0,
                 playbackRate: 1
             };
             dispatch({ type: 'ADD_ELEMENT', payload: newEl });
        }
        return;
    }

    // Check if dragging from Library
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
            trackId: 0,
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
        className="flex h-screen w-screen bg-[#0f0f11] text-white overflow-hidden" 
        onClick={closeContextMenu}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleAppDrop}
    >
      
      {/* LEFT: Timeline Canvas */}
      <div className="flex-1 flex flex-col relative min-w-0">
        {/* Top Bar */}
        <div className="h-14 bg-[#18181b] border-b border-white/10 flex items-center px-4 justify-between z-20 shrink-0">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                    <Icons.Layers size={18} />
                </div>
                <h1 className="font-bold text-lg tracking-tight">Chroma<span className="text-blue-500">Canvas</span></h1>
            </div>
            
            <div className="flex items-center gap-4 bg-[#27272a] rounded-full px-3 py-1.5 border border-white/5">
                <button onClick={() => dispatch({ type: 'SET_ZOOM', payload: state.zoom - 10 })}><Icons.ZoomOut size={16} className="text-gray-400 hover:text-white" /></button>
                <span className="text-xs font-mono text-gray-400 w-12 text-center">{Math.round(state.zoom)}%</span>
                <button onClick={() => dispatch({ type: 'SET_ZOOM', payload: state.zoom + 10 })}><Icons.ZoomIn size={16} className="text-gray-400 hover:text-white" /></button>
            </div>
        </div>

        {/* Main Canvas Area */}
        <Timeline state={state} dispatch={dispatch} onContextMenu={handleContextMenu} />
      </div>

      {/* RIGHT: Sidebar */}
      <RightSidebar state={state} dispatch={dispatch} width={sidebarWidth} setWidth={setSidebarWidth} />

      {/* Custom Context Menu */}
      {contextMenu.visible && (
        <div 
            className="fixed z-[100] bg-[#27272a] border border-white/10 rounded-lg shadow-2xl py-1 w-48 text-sm animate-in fade-in zoom-in-95 duration-100"
            style={{ top: contextMenu.y, left: contextMenu.x }}
        >
            {contextMenu.targetId ? (
                <>
                    <button className="w-full text-left px-4 py-2 hover:bg-blue-600 flex items-center gap-2" onClick={() => dispatch({ type: 'COPY_ELEMENT', payload: contextMenu.targetId })}>
                        <Icons.Copy size={14} /> Copy
                    </button>
                    <button className="w-full text-left px-4 py-2 hover:bg-blue-600 flex items-center gap-2" onClick={() => dispatch({ type: 'SPLIT_CLIP', payload: contextMenu.targetId })}>
                        <Icons.Scissors size={14} /> Split Clip
                    </button>
                    <button className="w-full text-left px-4 py-2 hover:bg-blue-600 flex items-center gap-2" onClick={() => dispatch({ type: 'EXTRACT_AUDIO', payload: contextMenu.targetId })}>
                        <Icons.Music size={14} /> Extract Audio
                    </button>
                    <div className="h-[1px] bg-white/10 my-1" />
                    <button className="w-full text-left px-4 py-2 hover:bg-red-900/50 text-red-400 flex items-center gap-2" onClick={() => dispatch({ type: 'DELETE_ELEMENT', payload: contextMenu.targetId })}>
                        <Icons.Trash size={14} /> Delete
                    </button>
                </>
            ) : (
                <>
                   <div className="px-4 py-1 text-xs text-gray-500 font-bold uppercase tracking-wider">Add to Canvas</div>
                   {state.clipboard && (
                        <button className="w-full text-left px-4 py-2 hover:bg-blue-600 flex items-center gap-2" onClick={() => dispatch({ type: 'PASTE_ELEMENT' })}>
                            <Icons.Clipboard size={14} /> Paste
                        </button>
                   )}
                   <button 
                        className="w-full text-left px-4 py-2 hover:bg-blue-600 flex items-center gap-2"
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
                    <div className="px-4 py-2 text-xs text-gray-400">
                        Tip: Drag files here to import
                    </div>
                </>
            )}
        </div>
      )}

    </div>
  );
};

export default App;
