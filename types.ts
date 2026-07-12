export enum ElementType {
  VIDEO = 'VIDEO',
  IMAGE = 'IMAGE',
  AUDIO = 'AUDIO',
  TEXT = 'TEXT',
}

export interface ElementFilters {
  brightness: number; // 1 = neutral
  contrast: number; // 1 = neutral
  saturate: number; // 1 = neutral
  blur: number; // px, 0 = neutral
}

export const NEUTRAL_FILTERS: ElementFilters = {
  brightness: 1,
  contrast: 1,
  saturate: 1,
  blur: 0,
};

export interface CanvasElement {
  id: string;
  type: ElementType;
  src?: string; // Runtime URL for media (object URL, data URL, or remote)
  mediaId?: string; // IndexedDB media id — set for locally stored blobs
  text?: string; // Content for text elements
  name: string;

  // Timeline positioning
  startTime: number; // in seconds
  duration: number; // in seconds
  trackId: number; // Vertical layer index (0 is bottom)

  // Visual Properties
  x?: number; // Preview-space X offset
  y?: number; // Preview-space Y offset
  width?: number;

  // Media Properties
  volume: number; // 0-1
  opacity: number; // 0-1
  rotation: number; // degrees
  scale: number; // 1 = 100%
  playbackRate: number; // Speed multiplier (default 1)
  fontSize?: number; // px for text
  fontFamily?: string; // for text
  color?: string; // for text

  // Trimming (Video/Audio)
  trimStart: number; // Seconds skipped from start of source (media time)
  sourceDuration?: number; // Full duration of the underlying media, for trim clamps

  // Fades
  fadeIn: number; // Seconds
  fadeOut: number; // Seconds

  filters?: ElementFilters;

  // Procedural Animation Names (optional)
  animationName?: string;
}

export type LibraryCategory = 'VIDEO' | 'IMAGE' | 'AUDIO' | 'OVERLAY' | 'GIF' | 'TRANSITION';

export interface LibraryItem {
  id: string;
  type: ElementType;
  src: string;
  mediaId?: string; // IndexedDB media id — set for locally stored blobs
  name: string;
  category: LibraryCategory;
  duration?: number;
}

export interface TrackMeta {
  muted: boolean;
  locked: boolean;
  hidden: boolean;
}

export const DEFAULT_TRACK_META: TrackMeta = { muted: false, locked: false, hidden: false };

/** The undoable part of the editor state (persisted + tracked in history). */
export interface ProjectDoc {
  elements: CanvasElement[];
  library: LibraryItem[];
  duration: number;
  tracks: Record<number, TrackMeta>;
  canvasMode: 'landscape' | 'portrait';
}

export interface EditorState extends ProjectDoc {
  currentTime: number; // Current playhead position in seconds
  isPlaying: boolean;
  zoom: number; // Pixels per second
  selectedIds: string[];
  seekVersion: number; // Increments on manual seek to reset animation loop
  clipboard: CanvasElement[] | null;
  view: AppView;
  isAutoFit: boolean;
  fitVersion: number; // Trigger for one-time fit
  snapping: boolean;
}

export type AppView = 'EDITOR' | 'RECORDER' | 'GALLERY';

export type EditorAction =
  | { type: 'SET_VIEW'; payload: AppView }
  | { type: 'ADD_ELEMENT'; payload: CanvasElement }
  | {
      type: 'UPDATE_ELEMENT';
      payload: { id: string; changes: Partial<CanvasElement> };
      transient?: boolean;
    }
  | {
      type: 'UPDATE_ELEMENTS';
      payload: { ids: string[]; changes: Partial<CanvasElement> };
      transient?: boolean;
    }
  | {
      type: 'MOVE_ELEMENTS';
      payload: { updates: { id: string; changes: Partial<CanvasElement> }[] };
      transient?: boolean;
    }
  | { type: 'SELECT_ELEMENT'; payload: string | null }
  | { type: 'SET_SELECTION'; payload: string[] }
  | { type: 'DESELECT_ALL' }
  | { type: 'SELECT_ALL' }
  | { type: 'SET_TIME'; payload: number }
  | { type: 'SEEK'; payload: number }
  | { type: 'TOGGLE_PLAY' }
  | { type: 'SET_PLAYING'; payload: boolean }
  | { type: 'SET_ZOOM'; payload: number }
  | { type: 'TOGGLE_AUTO_FIT' }
  | { type: 'TRIGGER_FIT_VIEW' }
  | { type: 'TOGGLE_SNAPPING' }
  | { type: 'DELETE_SELECTED' }
  | { type: 'DELETE_ELEMENT'; payload: string }
  | { type: 'SET_CANVAS_MODE'; payload: 'landscape' | 'portrait' }
  | { type: 'COPY_SELECTED'; payload?: string }
  | { type: 'CUT_SELECTED'; payload?: string }
  | { type: 'PASTE_CLIPBOARD' }
  | { type: 'DUPLICATE_SELECTED' }
  | { type: 'EXTRACT_AUDIO'; payload: string | null }
  | { type: 'SPLIT_CLIP'; payload: string | null }
  | { type: 'NUDGE_SELECTED'; payload: { deltaTime: number } }
  | { type: 'CROSSFADE_WITH_NEXT'; payload: string }
  | { type: 'ADD_LIBRARY_ITEM'; payload: LibraryItem }
  | { type: 'ADD_LIBRARY_ITEMS'; payload: LibraryItem[] }
  | { type: 'DELETE_LIBRARY_ITEM'; payload: string }
  | { type: 'SET_TRACK_META'; payload: { trackId: number; changes: Partial<TrackMeta> } }
  | { type: 'LOAD_PROJECT'; payload: ProjectDoc }
  | { type: 'COMMIT_HISTORY' }
  | { type: 'UNDO' }
  | { type: 'REDO' };

export type EditorDispatch = (action: EditorAction) => void;

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  targetId: string | null; // Null means clicked on empty canvas
}
